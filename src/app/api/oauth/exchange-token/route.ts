/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * 通过临时token换取cookie的端点
 * GET /api/oauth/exchange-token
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: '缺少token参数' }, { status: 400 });
    }

    // 从临时存储中获取cookie
    const cookie = await getCookieFromToken(token);

    if (!cookie) {
      return NextResponse.json({ error: 'token无效或已过期' }, { status: 404 });
    }

    console.log('Token兑换成功:', token);

    // 返回cookie给前端
    const response = NextResponse.json({
      success: true,
      cookie: cookie,
    });

    // 设置安全相关的响应头
    response.headers.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate'
    );
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
  } catch (error) {
    console.error('Token兑换失败:', error);
    return NextResponse.json({ error: 'token兑换失败' }, { status: 500 });
  }
}

/**
 * 获取临时token对应的cookie（从callback路由复制）
 */
async function getCookieFromToken(token: string): Promise<string | null> {
  try {
    const tempTokenStore = global.tempTokenStore;
    if (!tempTokenStore) {
      return null;
    }

    const tokenData = tempTokenStore.get(token);
    if (!tokenData) {
      return null;
    }

    // 检查是否过期
    if (tokenData.expires < Date.now()) {
      tempTokenStore.delete(token);
      return null;
    }

    // 使用后立即删除
    tempTokenStore.delete(token);
    return tokenData.cookie;
  } catch (error) {
    console.error('获取cookie失败:', error);
    return null;
  }
}
