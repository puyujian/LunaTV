/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { LinuxDoUserInfo, OAuthTokenResponse } from '@/lib/admin.types';
import { getConfig, setCachedConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * OAuth2 回调处理端点
 * GET /api/oauth/callback
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // 检查是否有授权错误
    if (error) {
      console.error('OAuth 授权错误:', error);
      return redirectToLogin('授权被拒绝或取消', req);
    }

    // 检查必要参数
    if (!code || !state) {
      console.error('OAuth 回调参数缺失:', { code: !!code, state: !!state });
      return redirectToLogin('授权回调参数异常', req);
    }

    // 验证 state 参数
    const storedState = req.cookies.get('oauth_state')?.value;
    if (!storedState || storedState !== state) {
      console.error('OAuth state 验证失败:', {
        stored: storedState,
        received: state,
      });
      return redirectToLogin('授权状态验证失败，可能存在安全风险', req);
    }

    const config = await getConfig();
    const oauthConfig = config.SiteConfig.LinuxDoOAuth;

    // 检查 OAuth 功能是否启用
    if (!oauthConfig.enabled) {
      return redirectToLogin('LinuxDo OAuth 功能已禁用', req);
    }

    // 1. 用授权码换取访问令牌
    const tokenData = await exchangeCodeForToken(code, req, oauthConfig);
    if (!tokenData) {
      return redirectToLogin('获取访问令牌失败', req);
    }

    // 2. 使用访问令牌获取用户信息
    const userInfo = await fetchUserInfo(tokenData.access_token, oauthConfig);
    if (!userInfo) {
      return redirectToLogin('获取用户信息失败', req);
    }

    // 3. 验证用户状态和信任等级
    if (!userInfo.active) {
      return redirectToLogin('您的 LinuxDo 账号已被禁用', req);
    }

    if (userInfo.silenced) {
      return redirectToLogin('您的 LinuxDo 账号已被禁言', req);
    }

    if (userInfo.trust_level < oauthConfig.minTrustLevel) {
      return redirectToLogin(
        `需要信任等级 ${oauthConfig.minTrustLevel} 以上才能登录，当前等级：${userInfo.trust_level}`,
        req
      );
    }

    // 4. 查找或创建用户
    const username = await findOrCreateUser(userInfo, oauthConfig, config);
    if (!username) {
      return redirectToLogin('用户创建或查找失败', req);
    }

    // 5. 生成认证 Cookie 并登录
    const authCookie = await generateAuthCookie(username, 'user');
    const response = NextResponse.redirect(new URL('/', req.url));

    // 设置认证 Cookie
    const expires = new Date();
    expires.setDate(expires.getDate() + 7); // 7天过期

    response.cookies.set('auth', authCookie, {
      path: '/',
      expires,
      sameSite: 'lax',
      httpOnly: false,
      secure: req.url.startsWith('https://'),
    });

    // 清除 OAuth state cookie
    response.cookies.set('oauth_state', '', {
      path: '/',
      expires: new Date(0),
    });

    return response;
  } catch (error) {
    console.error('OAuth 回调处理失败:', error);
    return redirectToLogin('登录过程中发生错误，请稍后重试', req);
  }
}

/**
 * 用授权码换取访问令牌
 */
async function exchangeCodeForToken(
  code: string,
  req: NextRequest,
  oauthConfig: any
): Promise<OAuthTokenResponse | null> {
  try {
    const redirectUri = oauthConfig.redirectUri || getRedirectUri(req);

    // 准备 Basic Auth header
    const credentials = `${oauthConfig.clientId}:${oauthConfig.clientSecret}`;
    const base64Credentials = Buffer.from(credentials).toString('base64');

    const response = await fetch(oauthConfig.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${base64Credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('令牌交换失败:', response.status, errorText);
      return null;
    }

    return (await response.json()) as OAuthTokenResponse;
  } catch (error) {
    console.error('令牌交换请求失败:', error);
    return null;
  }
}

/**
 * 获取用户信息
 */
async function fetchUserInfo(
  accessToken: string,
  oauthConfig: any
): Promise<LinuxDoUserInfo | null> {
  try {
    const response = await fetch(oauthConfig.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('获取用户信息失败:', response.status, errorText);
      return null;
    }

    return (await response.json()) as LinuxDoUserInfo;
  } catch (error) {
    console.error('用户信息请求失败:', error);
    return null;
  }
}

/**
 * 查找或创建用户
 */
async function findOrCreateUser(
  userInfo: LinuxDoUserInfo,
  oauthConfig: any,
  config: any
): Promise<string | null> {
  try {
    // 首先查找是否存在相同 LinuxDo ID 的用户
    const existingUsers = config.UserConfig.Users;
    const existingUser = existingUsers.find(
      (u: any) => u.linuxdoId === userInfo.id
    );

    if (existingUser) {
      // 更新用户的 LinuxDo 信息
      existingUser.linuxdoUsername = userInfo.username;
      await setCachedConfig(config);
      await db.saveAdminConfig(config);
      return existingUser.username;
    }

    // 检查是否允许自动注册
    if (!oauthConfig.autoRegister) {
      console.log('自动注册已禁用，用户:', userInfo.username);
      return null;
    }

    // 生成唯一用户名
    const baseUsername = `linuxdo_${userInfo.username}`;
    let username = baseUsername;
    let counter = 1;

    while (await db.checkUserExist(username)) {
      username = `${baseUsername}_${counter}`;
      counter++;
    }

    // 生成随机密码用于数据库存储
    const password = generateRandomPassword();
    const hashedPassword = await hashPassword(password);

    // 注册新用户
    await db.registerUser(username, hashedPassword);

    // 更新配置中的用户信息
    config.UserConfig.Users.push({
      username,
      role: oauthConfig.defaultRole,
      banned: false,
      status: 'active',
      registeredAt: Date.now(),
      linuxdoId: userInfo.id,
      linuxdoUsername: userInfo.username,
    });

    await setCachedConfig(config);
    await db.saveAdminConfig(config);

    console.log(
      '自动创建 LinuxDo 用户:',
      username,
      '(原用户名:',
      userInfo.username,
      ')'
    );
    return username;
  } catch (error) {
    console.error('查找或创建用户失败:', error);
    return null;
  }
}

/**
 * 生成认证 Cookie
 */
async function generateAuthCookie(
  username: string,
  role: string
): Promise<string> {
  const authData: any = {
    username,
    role,
    timestamp: Date.now(),
  };

  // 如果有密码环境变量，生成签名
  if (process.env.PASSWORD) {
    const signature = await generateSignature(username, process.env.PASSWORD);
    authData.signature = signature;
  }

  return encodeURIComponent(JSON.stringify(authData));
}

/**
 * 生成签名
 */
async function generateSignature(
  data: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 密码哈希
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成随机密码
 */
function generateRandomPassword(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

/**
 * 获取回调地址
 */
function getRedirectUri(req: NextRequest): string {
  const url = new URL(req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  return `${baseUrl}/api/oauth/callback`;
}

/**
 * 重定向到登录页面并显示错误信息
 */
function redirectToLogin(error: string, req: NextRequest): NextResponse {
  const url = new URL(req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const loginUrl = new URL('/login', baseUrl);
  loginUrl.searchParams.set('oauth_error', error);
  return NextResponse.redirect(loginUrl.toString());
}
