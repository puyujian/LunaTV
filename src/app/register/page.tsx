'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { RegisterResponse } from '@/lib/admin.types';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

function RegisterPageClient() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState<
    boolean | null
  >(null);
  const [storageType, setStorageType] = useState<string>('localstorage');

  const { siteName } = useSite();

  // 检查注册是否开启
  useEffect(() => {
    fetch('/api/server-config')
      .then((res) => res.json())
      .then((data) => {
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
          confirmPassword: formData.confirmPassword,
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
    setFormData((prev) => ({
      ...prev,
      [name]: value,
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
              <div
                className={`p-4 rounded-lg border-l-4 ${
                  error.includes('所有字段都是必填') ||
                  error.includes('确认密码不匹配')
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 text-yellow-800 dark:text-yellow-200'
                    : error.includes('用户名已存在') || error.includes('用户名')
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 text-blue-800 dark:text-blue-200'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-400 text-red-800 dark:text-red-200'
                }`}
              >
                <div className='flex items-center'>
                  <div className='flex-shrink-0'>
                    {error.includes('所有字段都是必填') ||
                    error.includes('确认密码不匹配') ? (
                      <svg
                        className='w-5 h-5 text-yellow-400'
                        fill='currentColor'
                        viewBox='0 0 20 20'
                      >
                        <path
                          fillRule='evenodd'
                          d='M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z'
                          clipRule='evenodd'
                        />
                      </svg>
                    ) : error.includes('用户名已存在') ||
                      error.includes('用户名') ? (
                      <svg
                        className='w-5 h-5 text-blue-400'
                        fill='currentColor'
                        viewBox='0 0 20 20'
                      >
                        <path
                          fillRule='evenodd'
                          d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z'
                          clipRule='evenodd'
                        />
                      </svg>
                    ) : (
                      <svg
                        className='w-5 h-5 text-red-400'
                        fill='currentColor'
                        viewBox='0 0 20 20'
                      >
                        <path
                          fillRule='evenodd'
                          d='M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z'
                          clipRule='evenodd'
                        />
                      </svg>
                    )}
                  </div>
                  <div className='ml-3 flex-1'>
                    <p className='text-sm font-medium'>
                      {error.includes('所有字段都是必填') && '请完整填写表单'}
                      {error.includes('确认密码不匹配') && '密码不一致'}
                      {error.includes('用户名已存在') && '用户名不可用'}
                      {error.includes('网络错误') && '网络连接失败'}
                      {!error.includes('所有字段都是必填') &&
                        !error.includes('确认密码不匹配') &&
                        !error.includes('用户名已存在') &&
                        !error.includes('网络错误') &&
                        '注册失败'}
                    </p>
                    <p className='text-sm opacity-80 mt-1'>{error}</p>
                    {error.includes('所有字段都是必填') && (
                      <p className='text-xs opacity-70 mt-2'>
                        💡 请确保用户名、密码和确认密码都已填写
                      </p>
                    )}
                    {error.includes('确认密码不匹配') && (
                      <p className='text-xs opacity-70 mt-2'>
                        💡 请确保两次输入的密码完全相同
                      </p>
                    )}
                    {error.includes('用户名已存在') && (
                      <p className='text-xs opacity-70 mt-2'>
                        💡 请尝试使用其他用户名
                      </p>
                    )}
                    {error.includes('网络错误') && (
                      <p className='text-xs opacity-70 mt-2'>
                        💡 请检查网络连接后重试
                      </p>
                    )}
                  </div>
                </div>
              </div>
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
