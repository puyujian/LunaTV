/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { LinuxDoUserInfo, OAuthTokenResponse } from '@/lib/admin.types';
import { getConfig, saveAndCacheConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * OAuth2 回调处理端点
 * GET /api/oauth/callback
 */
export async function GET(req: NextRequest) {
  try {
    console.log('OAuth 回调开始处理:', req.url);

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

    // 从 state 参数中解析移动端标识
    const isMobileFromState = state.endsWith('_mobile');
    const isMobileFromCookie =
      req.cookies.get('oauth_mobile')?.value === 'true';

    console.log('移动端标识解析:', {
      state: state,
      isMobileFromState,
      isMobileFromCookie,
    });

    console.log('OAuth 参数验证成功，获取配置...');

    let config;
    try {
      config = await getConfig();
    } catch (configError) {
      console.error('获取配置失败:', configError);
      return redirectToLogin('系统配置加载失败，请稍后重试', req);
    }

    if (!config || !config.SiteConfig) {
      console.error('配置结构异常:', {
        hasConfig: !!config,
        hasSiteConfig: !!config?.SiteConfig,
      });
      return redirectToLogin('系统配置异常，请联系管理员', req);
    }

    const oauthConfig = config.SiteConfig.LinuxDoOAuth;

    // 检查 OAuth 功能是否启用
    if (!oauthConfig || !oauthConfig.enabled) {
      console.error('OAuth 配置问题:', {
        hasOAuthConfig: !!oauthConfig,
        enabled: oauthConfig?.enabled,
      });
      return redirectToLogin('LinuxDo OAuth 功能未启用或配置异常', req);
    }

    if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
      console.error('OAuth 客户端配置缺失:', {
        hasClientId: !!oauthConfig.clientId,
        hasClientSecret: !!oauthConfig.clientSecret,
      });
      return redirectToLogin('OAuth 客户端配置不完整，请联系管理员', req);
    }

    console.log('OAuth 配置验证通过，开始令牌交换...');

    // 1. 用授权码换取访问令牌
    const tokenData = await exchangeCodeForToken(code, req, oauthConfig);
    if (!tokenData) {
      console.error('令牌交换失败');
      return redirectToLogin('获取访问令牌失败', req);
    }

    console.log('令牌交换成功，获取用户信息...');

    // 2. 使用访问令牌获取用户信息
    const userInfo = await fetchUserInfo(tokenData.access_token, oauthConfig);
    if (!userInfo) {
      console.error('用户信息获取失败');
      return redirectToLogin('获取用户信息失败', req);
    }

    console.log('用户信息获取成功:', {
      username: userInfo.username,
      trustLevel: userInfo.trust_level,
    });

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
    let username;
    try {
      username = await findOrCreateUser(userInfo, oauthConfig, config);
      if (!username) {
        console.error('用户创建或查找失败: findOrCreateUser 返回 null');
        return redirectToLogin('用户创建或查找失败', req);
      }
      console.log('用户处理成功:', username);
    } catch (userError) {
      console.error('用户创建或查找过程出错:', userError);
      return redirectToLogin('用户处理失败，请稍后重试', req);
    }

    // 5. 生成认证 Cookie 并登录
    let authCookie;
    try {
      authCookie = await generateAuthCookie(username, undefined, 'user', false);
    } catch (authError) {
      console.error('生成认证 Cookie 失败:', authError);
      return redirectToLogin('认证失败，请稍后重试', req);
    }
    const baseUrl = getBaseUrl(req);

    // 检测请求来源，优先使用state参数中的移动端标识
    const userAgent = req.headers.get('user-agent') || '';
    const referer = req.headers.get('referer') || '';

    // 多重检测移动端标识，优先级：state参数 > cookie > URL参数 > headers
    const isMobileApp =
      isMobileFromState || // 优先：state参数
      isMobileFromCookie || // 备选1：cookie
      userAgent.includes('OrionTV') || // 备选2：User-Agent
      req.url.includes('mobile=1') || // 备选3：URL参数
      req.headers.get('x-mobile-app') === 'true' || // 备选4：自定义header
      referer.includes('mobile=1') || // 备选5：referer
      referer.includes('mobile%3D1'); // 备选6：URL编码的mobile参数

    console.log('移动应用检测详情:', {
      userAgent,
      referer,
      host: req.headers.get('host'),
      isMobileFromState,
      isMobileFromCookie,
      hasUserAgentOrion: userAgent.includes('OrionTV'),
      hasUrlMobile: req.url.includes('mobile=1'),
      hasXMobileApp: req.headers.get('x-mobile-app') === 'true',
      hasRefererMobile: referer.includes('mobile=1'),
      hasRefererMobileEncoded: referer.includes('mobile%3D1'),
      finalIsMobileApp: isMobileApp,
    });

    let response;
    if (isMobileApp) {
      // 移动应用：深度链接直接传递cookie
      const deepLinkUrl = new URL('oriontv://oauth/callback');
      deepLinkUrl.searchParams.set('success', 'true');
      deepLinkUrl.searchParams.set('cookie', authCookie); // 直接传递cookie

      console.log('构建的深度链接URL:', deepLinkUrl.toString());

      response = NextResponse.redirect(deepLinkUrl.toString());
    } else {
      // Web应用：重定向到首页
      response = NextResponse.redirect(new URL('/', baseUrl));
    }

    // 设置认证 Cookie
    const expires = new Date();
    expires.setDate(expires.getDate() + 7); // 7天过期

    response.cookies.set('auth', authCookie, {
      path: '/',
      expires,
      sameSite: 'lax',
      httpOnly: false,
      secure: false, // 与login接口保持一致，避免HTTPS/HTTP问题
    });

    // 清除 OAuth 相关的 cookies
    response.cookies.set('oauth_state', '', {
      path: '/',
      expires: new Date(0),
    });

    response.cookies.set('oauth_mobile', '', {
      path: '/',
      expires: new Date(0),
    });

    return response;
  } catch (error) {
    console.error('OAuth 回调处理失败:', error);

    // 记录更详细的错误信息
    if (error instanceof Error) {
      console.error('错误详情:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    }

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
    console.log('开始查找或创建用户:', {
      linuxdoId: userInfo.id,
      username: userInfo.username,
    });

    // 首先查找是否存在相同 LinuxDo ID 的用户
    const existingUsers = config.UserConfig.Users;
    const existingUser = existingUsers.find(
      (u: any) => u.linuxdoId === userInfo.id
    );

    if (existingUser) {
      console.log('找到现有用户:', existingUser.username);
      // 更新用户的 LinuxDo 信息
      existingUser.linuxdoUsername = userInfo.username;
      try {
        await saveAndCacheConfig(config);
        console.log('更新现有用户信息成功');
      } catch (updateError) {
        console.error('更新用户信息失败:', updateError);
        // 继续流程，不阻断登录
      }
      return existingUser.username;
    }

    // 检查是否允许自动注册
    if (!oauthConfig.autoRegister) {
      console.log('自动注册已禁用，用户:', userInfo.username);
      return null;
    }

    console.log('开始自动注册新用户...');

    // 生成唯一用户名
    const baseUsername = `linuxdo_${userInfo.username}`;
    let username = baseUsername;
    let counter = 1;

    while (await db.checkUserExist(username)) {
      username = `${baseUsername}_${counter}`;
      counter++;
      if (counter > 100) {
        // 防止无限循环
        console.error('生成唯一用户名失败，尝试次数过多');
        throw new Error('无法生成唯一用户名');
      }
    }

    console.log('生成用户名:', username);

    // 生成随机密码用于数据库存储
    const password = generateRandomPassword();

    // 注册新用户（使用明文密码，与现有系统保持一致）
    try {
      await db.registerUser(username, password);
      console.log('数据库用户注册成功');
    } catch (dbError) {
      console.error('数据库用户注册失败:', dbError);
      throw new Error('数据库用户注册失败');
    }

    // 更新配置中的用户信息
    config.UserConfig.Users.push({
      username,
      role: oauthConfig.defaultRole,
      banned: false,
      linuxdoId: userInfo.id,
      linuxdoUsername: userInfo.username,
    });

    try {
      await saveAndCacheConfig(config);
      console.log('配置更新成功');
    } catch (configError) {
      console.error('配置更新失败:', configError);
      // 尝试清理已创建的用户
      try {
        await db.deleteUser(username);
      } catch (cleanupError) {
        console.error('清理用户失败:', cleanupError);
      }
      throw new Error('配置更新失败');
    }

    console.log(
      '自动创建 LinuxDo 用户成功:',
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
 * 生成认证 Cookie（与login接口保持一致的格式）
 */
async function generateAuthCookie(
  username?: string,
  password?: string,
  role?: 'owner' | 'admin' | 'user',
  includePassword = false
): Promise<string> {
  const authData: any = { role: role || 'user' };

  // 只在需要时包含 password
  if (includePassword && password) {
    authData.password = password;
  }

  if (username && process.env.PASSWORD) {
    authData.username = username;
    // 使用密码作为密钥对用户名进行签名
    const signature = await generateSignature(username, process.env.PASSWORD);
    authData.signature = signature;
    authData.timestamp = Date.now(); // 添加时间戳防重放攻击
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
 * 获取基础 URL，优先使用请求头中的 Host
 */
function getBaseUrl(req: NextRequest): string {
  const url = new URL(req.url);

  // 优先使用请求头中的 Host，避免开发环境中的 0.0.0.0 问题
  const host = req.headers.get('host') || url.host;

  // 智能协议判断：生产环境优先使用 HTTPS
  let protocol = req.headers.get('x-forwarded-proto');

  if (!protocol) {
    // 如果没有 x-forwarded-proto，根据 host 判断
    if (
      host &&
      !host.includes('localhost') &&
      !host.includes('127.0.0.1') &&
      !host.includes('0.0.0.0')
    ) {
      protocol = 'https:';
    } else {
      protocol = url.protocol;
    }
  } else if (!protocol.endsWith(':')) {
    protocol = protocol + ':';
  }

  return `${protocol}//${host}`;
}

/**
 * 获取回调地址
 */
function getRedirectUri(req: NextRequest): string {
  const baseUrl = getBaseUrl(req);
  return `${baseUrl}/api/oauth/callback`;
}

/**
 * 重定向到登录页面并显示错误信息
 */
function redirectToLogin(error: string, req: NextRequest): NextResponse {
  // 尝试从多个来源检测移动端请求
  const userAgent = req.headers.get('user-agent') || '';
  const referer = req.headers.get('referer') || '';
  const isMobileFromCookie = req.cookies.get('oauth_mobile')?.value === 'true';

  // URL中state参数检测（虽然这里可能已经是错误情况，但仍尝试检测）
  const url = new URL(req.url);
  const state = url.searchParams.get('state') || '';
  const isMobileFromState = state.endsWith('_mobile');

  const isMobileApp =
    isMobileFromState ||
    isMobileFromCookie ||
    userAgent.includes('OrionTV') ||
    req.url.includes('mobile=1') ||
    req.headers.get('x-mobile-app') === 'true' ||
    referer.includes('mobile=1') ||
    referer.includes('mobile%3D1');

  console.log('redirectToLogin移动应用检测:', {
    userAgent,
    referer,
    url: req.url,
    host: req.headers.get('host'),
    isMobileFromState,
    isMobileFromCookie,
    isMobileApp,
  });

  if (isMobileApp) {
    // 移动应用：重定向到深度链接并传递错误信息
    const errorUrl = `oriontv://oauth/callback?error=${encodeURIComponent(
      error
    )}`;
    console.log('重定向到深度链接错误页面:', errorUrl);
    return NextResponse.redirect(errorUrl);
  } else {
    // Web应用：重定向到登录页面
    const baseUrl = getBaseUrl(req);
    const loginUrl = new URL('/login', baseUrl);
    loginUrl.searchParams.set('oauth_error', error);
    console.log('重定向到Web登录页面:', loginUrl.toString());
    return NextResponse.redirect(loginUrl.toString());
  }
}
