/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { NextRequest, NextResponse } from 'next/server';

import { OAuthConfig } from '@/lib/admin.types';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig, setCachedConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * 获取 OAuth 配置
 * GET /api/admin/oauth
 */
export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const username = authInfo.username;
    const adminConfig = await getConfig();

    // 权限校验：只有 owner 和 admin 可以访问
    if (username !== process.env.USERNAME) {
      const user = adminConfig.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!user || user.role !== 'admin' || user.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    // 返回 OAuth 配置（不返回敏感信息 clientSecret）
    const { clientSecret, ...safeConfig } = adminConfig.SiteConfig.LinuxDoOAuth;
    const result = {
      ...safeConfig,
      clientSecret: clientSecret ? '••••••••' : '', // 隐藏真实密钥
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('获取 OAuth 配置失败:', error);
    return NextResponse.json({ error: '获取配置失败' }, { status: 500 });
  }
}

/**
 * 更新 OAuth 配置
 * POST /api/admin/oauth
 */
export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const username = authInfo.username;
    const adminConfig = await getConfig();

    // 权限校验：只有 owner 和 admin 可以修改
    if (username !== process.env.USERNAME) {
      const user = adminConfig.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!user || user.role !== 'admin' || user.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    const {
      enabled,
      autoRegister,
      minTrustLevel,
      defaultRole,
      clientId,
      clientSecret,
      redirectUri,
    } = body as {
      enabled: boolean;
      autoRegister: boolean;
      minTrustLevel: number;
      defaultRole: 'user' | 'admin';
      clientId: string;
      clientSecret: string;
      redirectUri?: string;
    };

    // 参数校验
    if (
      typeof enabled !== 'boolean' ||
      typeof autoRegister !== 'boolean' ||
      typeof minTrustLevel !== 'number' ||
      typeof defaultRole !== 'string' ||
      typeof clientId !== 'string' ||
      typeof clientSecret !== 'string'
    ) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    if (!['user', 'admin'].includes(defaultRole)) {
      return NextResponse.json(
        { error: '默认角色必须是 user 或 admin' },
        { status: 400 }
      );
    }

    if (minTrustLevel < 0 || minTrustLevel > 4) {
      return NextResponse.json(
        { error: '信任等级必须在 0-4 之间' },
        { status: 400 }
      );
    }

    // 如果启用 OAuth，必须提供 clientId 和 clientSecret
    if (enabled && (!clientId.trim() || !clientSecret.trim())) {
      return NextResponse.json(
        { error: '启用 OAuth 时必须提供应用 ID 和密钥' },
        { status: 400 }
      );
    }

    // 更新 OAuth 配置
    const newOAuthConfig: OAuthConfig = {
      enabled,
      autoRegister,
      minTrustLevel,
      defaultRole,
      clientId: clientId.trim(),
      clientSecret:
        clientSecret === '••••••••'
          ? adminConfig.SiteConfig.LinuxDoOAuth.clientSecret // 保持原有密钥
          : clientSecret.trim(),
      redirectUri: redirectUri?.trim() || undefined,
      authorizeUrl: 'https://connect.linux.do/oauth2/authorize',
      tokenUrl: 'https://connect.linux.do/oauth2/token',
      userInfoUrl: 'https://connect.linux.do/api/user',
    };

    adminConfig.SiteConfig.LinuxDoOAuth = newOAuthConfig;

    // 保存配置
    await setCachedConfig(adminConfig);
    await db.saveAdminConfig(adminConfig);

    console.log(`OAuth 配置已更新 by ${username}`);

    return NextResponse.json(
      { ok: true, message: 'OAuth 配置更新成功' },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('更新 OAuth 配置失败:', error);
    return NextResponse.json(
      {
        error: '更新配置失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
