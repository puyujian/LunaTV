'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { RegisterResponse } from '@/lib/admin.types';

import { ThemeToggle } from '@/components/ThemeToggle';
import { useSite } from '@/components/SiteProvider';

function RegisterPageClient() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);
  const [storageType, setStorageType] = useState<string>('localstorage');

  const { siteName } = useSite();

  // 检查注册是否开启
  useEffect(() => {
    fetch('/api/server-config')
      .then(res => res.json())
      .then(data => {
        setRegistrationEnabled(data.EnableRegistration || false);
        setStorageType(data.StorageType || 'localstorage');
      })
      .catch(() => {
        setRegistrationEnabled(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.username || !formData.password || !formData.confirmPassword) {
      setError('所有字段都是必填的');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('确认密码不匹配');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          confirmPassword: formData.confirmPassword
        }),
      });

      const data: RegisterResponse = await res.json();

      if (data.success) {
        setSuccess(data.message);
        setFormData({ username: '', password: '', confirmPassword: '' });
        
        // 如果不需要审批，3秒后跳转到登录页
        if (!data.needsApproval) {
          setTimeout(() => {
            router.push('/login?message=registration-success');
          }, 3000);
        }
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 加载中状态
  if (registrationEnabled === null) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-gray-500'>加载中...</div>
      </div>
    );
  }

  // LocalStorage 模式不支持注册
  if (storageType === 'localstorage') {
    return (
      <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'>
        <div className='absolute top-4 right-4'>
          <ThemeToggle />
        </div>
        <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-white/90 via-white/70 to-white/40 dark:from-zinc-900/90 dark:via-zinc-900/70 dark:to-zinc-900/40 backdrop-blur-xl shadow-2xl p-10 dark:border dark:border-zinc-800 text-center'>
          <h1 className='text-red-600 tracking-tight text-center text-3xl font-extrabold mb-8'>
            注册不可用
          </h1>
          <p className='text-gray-600 dark:text-gray-400 mb-8'>
            当前系统使用 LocalStorage 模式，不支持用户注册功能。
          </p>
          <Link
            href='/login'
            className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-green-700'
          >
            返回登录
          </Link>
        </div>
      </div>
    );
  }

  // 注册功能未开启
  if (!registrationEnabled) {
    return (
      <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'>
        <div className='absolute top-4 right-4'>
          <ThemeToggle />
        </div>
        <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-white/90 via-white/70 to-white/40 dark:from-zinc-900/90 dark:via-zinc-900/70 dark:to-zinc-900/40 backdrop-blur-xl shadow-2xl p-10 dark:border dark:border-zinc-800 text-center'>
          <h1 className='text-orange-600 tracking-tight text-center text-3xl font-extrabold mb-8'>
            注册已关闭
          </h1>
          <p className='text-gray-600 dark:text-gray-400 mb-8'>
            系统管理员暂时关闭了新用户注册功能。
          </p>
          <Link
            href='/login'
            className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-green-700'
          >
            返回登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'>
      <div className='absolute top-4 right-4'>
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-white/90 via-white/70 to-white/40 dark:from-zinc-900/90 dark:via-zinc-900/70 dark:to-zinc-900/40 backdrop-blur-xl shadow-2xl p-10 dark:border dark:border-zinc-800'>
        <h1 className='text-green-600 tracking-tight text-center text-3xl font-extrabold mb-8'>
          {siteName} - 注册
        </h1>
        
        {success ? (
          <div className='text-center'>
            <div className='text-green-600 dark:text-green-400 mb-4 p-4 rounded-lg bg-green-50 dark:bg-green-900/20'>
              {success}
            </div>
            <Link
              href='/login'
              className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-green-700'
            >
              前往登录
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className='space-y-6'>
            <div>
              <label htmlFor='username' className='sr-only'>
                用户名
              </label>
              <input
                id='username'
                name='username'
                type='text'
                autoComplete='username'
                className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
                placeholder='输入用户名 (3-20个字符)'
                value={formData.username}
                onChange={handleInputChange}
                maxLength={20}
                minLength={3}
              />
            </div>

            <div>
              <label htmlFor='password' className='sr-only'>
                密码
              </label>
              <input
                id='password'
                name='password'
                type='password'
                autoComplete='new-password'
                className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
                placeholder='输入密码 (至少6个字符)'
                value={formData.password}
                onChange={handleInputChange}
                maxLength={50}
                minLength={6}
              />
            </div>

            <div>
              <label htmlFor='confirmPassword' className='sr-only'>
                确认密码
              </label>
              <input
                id='confirmPassword'
                name='confirmPassword'
                type='password'
                autoComplete='new-password'
                className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
                placeholder='确认密码'
                value={formData.confirmPassword}
                onChange={handleInputChange}
                maxLength={50}
              />
            </div>

            {error && (
              <p className='text-sm text-red-600 dark:text-red-400 p-3 rounded-lg bg-red-50 dark:bg-red-900/20'>
                {error}
              </p>
            )}

            <button
              type='submit'
              disabled={loading}
              className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {loading ? '注册中...' : '注册账号'}
            </button>

            <div className='text-center text-sm text-gray-600 dark:text-gray-400'>
              已有账号？{' '}
              <Link
                href='/login'
                className='text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300'
              >
                立即登录
              </Link>
            </div>

            <div className='text-xs text-gray-500 dark:text-gray-500 text-center space-y-2'>
              <div>• 用户名只能包含字母、数字和下划线</div>
              <div>• 密码长度至少6个字符</div>
              <div>• 注册后可能需要等待管理员审核</div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterPageClient />
    </Suspense>
  );
}