/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { RegisterResponse } from '@/lib/admin.types';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 密码加密工具函数
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 验证用户名格式
function validateUsername(username: string): { valid: boolean; message?: string } {
  if (!username || username.trim().length === 0) {
    return { valid: false, message: '用户名不能为空' };
  }
  
  if (username.length < 3 || username.length > 20) {
    return { valid: false, message: '用户名长度必须在3-20个字符之间' };
  }
  
  // 只允许字母、数字、下划线
  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  if (!usernameRegex.test(username)) {
    return { valid: false, message: '用户名只能包含字母、数字和下划线' };
  }
  
  return { valid: true };
}

// 验证密码强度
function validatePassword(password: string): { valid: boolean; message?: string } {
  if (!password || password.length < 6) {
    return { valid: false, message: '密码长度至少6个字符' };
  }
  
  if (password.length > 50) {
    return { valid: false, message: '密码长度不能超过50个字符' };
  }
  
  return { valid: true };
}

export async function POST(req: NextRequest) {
  try {
    // 只在数据库模式下支持注册
    const STORAGE_TYPE = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    if (STORAGE_TYPE === 'localstorage') {
      return NextResponse.json(
        { 
          success: false, 
          message: 'LocalStorage 模式不支持用户注册' 
        } as RegisterResponse,
        { status: 400 }
      );
    }

    const { username, password, confirmPassword } = await req.json();

    // 获取系统配置
    const config = await getConfig();
    if (!config.SiteConfig.EnableRegistration) {
      return NextResponse.json(
        { 
          success: false, 
          message: '系统暂未开放注册' 
        } as RegisterResponse,
        { status: 403 }
      );
    }

    // 验证用户名格式
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return NextResponse.json(
        { 
          success: false, 
          message: usernameValidation.message! 
        } as RegisterResponse,
        { status: 400 }
      );
    }

    // 验证密码格式
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { 
          success: false, 
          message: passwordValidation.message! 
        } as RegisterResponse,
        { status: 400 }
      );
    }

    // 确认密码匹配
    if (password !== confirmPassword) {
      return NextResponse.json(
        { 
          success: false, 
          message: '确认密码不匹配' 
        } as RegisterResponse,
        { status: 400 }
      );
    }

    // 检查用户名是否已存在
    const userExists = await db.checkUserExist(username);
    if (userExists) {
      return NextResponse.json(
        { 
          success: false, 
          message: '用户名已存在' 
        } as RegisterResponse,
        { status: 400 }
      );
    }

    // 检查是否有待审核的同名用户
    const pendingUsers = await db.getPendingUsers();
    const pendingUserExists = pendingUsers.some(u => u.username === username);
    if (pendingUserExists) {
      return NextResponse.json(
        { 
          success: false, 
          message: '该用户名正在审核中，请勿重复提交' 
        } as RegisterResponse,
        { status: 400 }
      );
    }

    // 检查管理员用户名冲突
    if (username === process.env.USERNAME) {
      return NextResponse.json(
        { 
          success: false, 
          message: '用户名不可用' 
        } as RegisterResponse,
        { status: 400 }
      );
    }

    // 检查用户数量限制
    const stats = await db.getRegistrationStats();
    if (config.SiteConfig.MaxUsers && stats.totalUsers >= config.SiteConfig.MaxUsers) {
      return NextResponse.json(
        { 
          success: false, 
          message: '用户注册已达到上限' 
        } as RegisterResponse,
        { status: 400 }
      );
    }

    // 加密密码
    const hashedPassword = await hashPassword(password);

    // 根据配置决定是直接注册还是待审核
    if (config.SiteConfig.RegistrationApproval) {
      // 需要审核，创建待审核用户
      await db.createPendingUser(username, hashedPassword);
      
      return NextResponse.json({
        success: true,
        message: '注册申请已提交，请等待管理员审核',
        needsApproval: true
      } as RegisterResponse);
    } else {
      // 直接注册
      await db.registerUser(username, hashedPassword);
      
      return NextResponse.json({
        success: true,
        message: '注册成功，请使用用户名和密码登录'
      } as RegisterResponse);
    }

  } catch (error) {
    console.error('注册接口异常:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: '服务器错误，请稍后重试' 
      } as RegisterResponse,
      { status: 500 }
    );
  }
}