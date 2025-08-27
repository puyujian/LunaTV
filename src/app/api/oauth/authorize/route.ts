/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

/**
 * OAuth2 授权端点 - 跳转到 LinuxDo 授权页面
 * GET /api/oauth/authorize
 */
export async function GET(req: NextRequest) {
  try {
    const config = await getConfig();
    const oauthConfig = config.SiteConfig.LinuxDoOAuth;

    // 检查 OAuth 功能是否启用
    if (!oauthConfig.enabled) {
      return NextResponse.json(
        { error: 'LinuxDo OAuth 功能未启用' },
        { status: 403 }
      );
    }

    // 检查必要配置
    if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
      return NextResponse.json(
        { error: 'OAuth 配置不完整，请联系管理员' },
        { status: 500 }
      );
    }

    // 生成 state 参数防止 CSRF 攻击
    const state = generateRandomState();

    // 获取重定向地址，优先使用配置的 redirectUri
    const redirectUri = getRedirectUri(req, oauthConfig.redirectUri);

    // 构建授权 URL
    const authorizeUrl = new URL(oauthConfig.authorizeUrl);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', oauthConfig.clientId);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);

    // 将 state 存储到会话中（这里使用 cookie 存储）
    const response = NextResponse.redirect(authorizeUrl.toString());

    // 设置 state cookie，有效期 10 分钟
    response.cookies.set('oauth_state', state, {
      path: '/',
      httpOnly: true,
      secure: req.url.startsWith('https://'),
      sameSite: 'lax',
      maxAge: 10 * 60, // 10 分钟
    });

    return response;
  } catch (error) {
    console.error('OAuth 授权失败:', error);
    return NextResponse.json(
      { error: '授权失败，请稍后重试' },
      { status: 500 }
    );
  }
}

/**
 * 生成随机 state 参数
 */
function generateRandomState(): string {
  const array = new Uint8Array(32);
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
  const protocol = req.headers.get('x-forwarded-proto') || url.protocol;

  return `${protocol}//${host}`;
}

/**
 * 获取回调地址
 */
function getRedirectUri(req: NextRequest, configRedirectUri?: string): string {
  if (configRedirectUri) {
    return configRedirectUri;
  }

  // 自动构建回调地址
  const baseUrl = getBaseUrl(req);
  return `${baseUrl}/api/oauth/callback`;
}
