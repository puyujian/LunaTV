/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig, saveAndCacheConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 验证管理员权限
async function verifyAdminAccess(
  request: NextRequest
): Promise<{ authorized: boolean; message?: string }> {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo) {
    return { authorized: false, message: '未登录' };
  }

  // 检查是否是站长
  if (authInfo.username === process.env.USERNAME) {
    return { authorized: true };
  }

  // 检查是否是管理员用户
  const config = await getConfig();
  const user = config.UserConfig.Users.find(
    (u) => u.username === authInfo.username
  );
  if (user && (user.role === 'admin' || user.role === 'owner')) {
    return { authorized: true };
  }

  return { authorized: false, message: '权限不足' };
}

// GET: 获取注册设置和待审核用户列表
export async function GET(req: NextRequest) {
  try {
    const authCheck = await verifyAdminAccess(req);
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.message }, { status: 401 });
    }

    const config = await getConfig();
    const pendingUsers = await db.getPendingUsers();
    const stats = await db.getRegistrationStats();

    return NextResponse.json({
      settings: {
        enableRegistration: config.SiteConfig.EnableRegistration || false,
        registrationApproval: config.SiteConfig.RegistrationApproval || false,
        maxUsers: config.SiteConfig.MaxUsers,
      },
      pendingUsers,
      stats,
    });
  } catch (error) {
    console.error('获取注册管理信息失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// POST: 批准/拒绝用户注册，或更新注册设置
export async function POST(req: NextRequest) {
  try {
    const authCheck = await verifyAdminAccess(req);
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.message }, { status: 401 });
    }

    const { action, username, settings, usernames } = await req.json();

    if (action === 'approve') {
      if (!username) {
        return NextResponse.json({ error: '用户名不能为空' }, { status: 400 });
      }

      await db.approvePendingUser(username);

      // 将用户添加到配置中
      const config = await getConfig();
      const existingUser = config.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!existingUser) {
        config.UserConfig.Users.push({
          username,
          role: 'user',
          banned: false,
        });
        await saveAndCacheConfig(config);
      }

      return NextResponse.json({ message: `用户 ${username} 审核通过` });
    } else if (action === 'reject') {
      if (!username) {
        return NextResponse.json({ error: '用户名不能为空' }, { status: 400 });
      }

      await db.rejectPendingUser(username);
      return NextResponse.json({ message: `用户 ${username} 申请已拒绝` });
    } else if (action === 'updateSettings') {
      if (!settings) {
        return NextResponse.json(
          { error: '设置信息不能为空' },
          { status: 400 }
        );
      }

      const config = await getConfig();

      // 更新注册相关设置
      config.SiteConfig.EnableRegistration = settings.enableRegistration;
      config.SiteConfig.RegistrationApproval = settings.registrationApproval;

      if (typeof settings.maxUsers === 'number' && settings.maxUsers > 0) {
        config.SiteConfig.MaxUsers = settings.maxUsers;
      } else {
        delete config.SiteConfig.MaxUsers;
      }

      await db.saveAdminConfig(config);
      return NextResponse.json({ message: '注册设置已更新' });
    } else if (action === 'batchApprove') {
      if (!Array.isArray(usernames) || usernames.length === 0) {
        return NextResponse.json(
          { error: '用户列表不能为空' },
          { status: 400 }
        );
      }

      let successCount = 0;
      const errors = [];
      const config = await getConfig();
      let configModified = false;

      for (const username of usernames) {
        try {
          await db.approvePendingUser(username);

          // 检查是否需要添加用户到配置中
          const existingUser = config.UserConfig.Users.find(
            (u) => u.username === username
          );
          if (!existingUser) {
            config.UserConfig.Users.push({
              username,
              role: 'user',
              banned: false,
            });
            configModified = true;
          }

          successCount++;
        } catch (error) {
          errors.push(`${username}: ${error}`);
        }
      }

      // 只在配置有变化时才保存
      if (configModified) {
        await saveAndCacheConfig(config);
      }

      return NextResponse.json({
        message: `批量操作完成，成功: ${successCount}，失败: ${errors.length}`,
        errors,
      });
    } else if (action === 'batchReject') {
      if (!Array.isArray(usernames) || usernames.length === 0) {
        return NextResponse.json(
          { error: '用户列表不能为空' },
          { status: 400 }
        );
      }

      let successCount = 0;
      const errors = [];

      for (const username of usernames) {
        try {
          await db.rejectPendingUser(username);
          successCount++;
        } catch (error) {
          errors.push(`${username}: ${error}`);
        }
      }

      return NextResponse.json({
        message: `批量拒绝完成，成功: ${successCount}，失败: ${errors.length}`,
        errors,
      });
    } else {
      return NextResponse.json({ error: '无效的操作类型' }, { status: 400 });
    }
  } catch (error) {
    console.error('注册管理操作失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// DELETE: 清理过期的待审核用户（可选功能）
export async function DELETE(req: NextRequest) {
  try {
    const authCheck = await verifyAdminAccess(req);
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.message }, { status: 401 });
    }

    const pendingUsers = await db.getPendingUsers();
    const now = Date.now();
    const expiredTime = 7 * 24 * 60 * 60 * 1000; // 7天过期

    let cleanedCount = 0;
    for (const user of pendingUsers) {
      if (now - user.registeredAt > expiredTime) {
        try {
          await db.rejectPendingUser(user.username);
          cleanedCount++;
        } catch (error) {
          console.error(`清理过期用户 ${user.username} 失败:`, error);
        }
      }
    }

    return NextResponse.json({
      message: `已清理 ${cleanedCount} 个过期的待审核用户`,
    });
  } catch (error) {
    console.error('清理过期用户失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
