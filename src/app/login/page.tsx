/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldAskUsername, setShouldAskUsername] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [storageType, setStorageType] = useState<string>('localstorage');
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const { siteName } = useSite();

  // 在客户端挂载后设置配置
  useEffect(() => {
    // 获取服务器配置
    fetch('/api/server-config')
      .then((res) => res.json())
      .then((data) => {
        setRegistrationEnabled(data.EnableRegistration || false);
        setStorageType(data.StorageType || 'localstorage');
        setShouldAskUsername(
          data.StorageType && data.StorageType !== 'localstorage'
        );
        setOauthEnabled(data.LinuxDoOAuth?.enabled || false);
      })
      .catch(() => {
        setRegistrationEnabled(false);
        setStorageType('localstorage');
        setShouldAskUsername(false);
        setOauthEnabled(false);
      });

    // 检查 URL 参数中的成功消息和 OAuth 错误
    const message = searchParams.get('message');
    const oauthErrorParam = searchParams.get('oauth_error');

    if (message === 'registration-success') {
      setSuccessMessage('注册成功！请使用您的用户名和密码登录。');
    }

    if (oauthErrorParam) {
      setOauthError(decodeURIComponent(oauthErrorParam));
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!password || (shouldAskUsername && !username)) return;

    try {
      setLoading(true);
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          ...(shouldAskUsername ? { username } : {}),
        }),
      });

      if (res.ok) {
        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '登录失败，请重试');
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = () => {
    // 跳转到 OAuth 授权页面
    window.location.href = '/api/oauth/authorize';
  };

  return (
    <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'>
      <div className='absolute top-4 right-4'>
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-white/90 via-white/70 to-white/40 dark:from-zinc-900/90 dark:via-zinc-900/70 dark:to-zinc-900/40 backdrop-blur-xl shadow-2xl p-10 dark:border dark:border-zinc-800'>
        <h1 className='text-green-600 tracking-tight text-center text-3xl font-extrabold mb-8 bg-clip-text drop-shadow-sm'>
          {siteName}
        </h1>
        <form onSubmit={handleSubmit} className='space-y-8'>
          {shouldAskUsername && (
            <div>
              <label htmlFor='username' className='sr-only'>
                用户名
              </label>
              <input
                id='username'
                type='text'
                autoComplete='username'
                className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
                placeholder='输入用户名'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}

          <div>
            <label htmlFor='password' className='sr-only'>
              密码
            </label>
            <input
              id='password'
              type='password'
              autoComplete='current-password'
              className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
              placeholder='输入访问密码'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {successMessage && (
            <p className='text-sm text-green-600 dark:text-green-400 p-3 rounded-lg bg-green-50 dark:bg-green-900/20'>
              {successMessage}
            </p>
          )}

          {oauthError && (
            <p className='text-sm text-red-600 dark:text-red-400 p-3 rounded-lg bg-red-50 dark:bg-red-900/20'>
              {oauthError}
            </p>
          )}

          {error && (
            <div
              className={`p-4 rounded-lg border-l-4 ${
                error.includes('审核中')
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-400 text-amber-800 dark:text-amber-200'
                  : error.includes('被拒绝')
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-400 text-red-800 dark:text-red-200'
                  : error.includes('被封禁')
                  ? 'bg-gray-50 dark:bg-gray-900/20 border-gray-400 text-gray-800 dark:text-gray-200'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-400 text-red-800 dark:text-red-200'
              }`}
            >
              <div className='flex items-center'>
                <div className='flex-shrink-0'>
                  {error.includes('审核中') ? (
                    <svg
                      className='w-5 h-5 text-amber-400'
                      fill='currentColor'
                      viewBox='0 0 20 20'
                    >
                      <path
                        fillRule='evenodd'
                        d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z'
                        clipRule='evenodd'
                      />
                    </svg>
                  ) : error.includes('被拒绝') ? (
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
                  ) : error.includes('被封禁') ? (
                    <svg
                      className='w-5 h-5 text-gray-400'
                      fill='currentColor'
                      viewBox='0 0 20 20'
                    >
                      <path
                        fillRule='evenodd'
                        d='M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z'
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
                        d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z'
                        clipRule='evenodd'
                      />
                    </svg>
                  )}
                </div>
                <div className='ml-3 flex-1'>
                  <p className='text-sm font-medium'>
                    {error.includes('审核中') && '账号审核中'}
                    {error.includes('被拒绝') && '账号申请被拒绝'}
                    {error.includes('被封禁') && '账号被封禁'}
                    {!error.includes('审核中') &&
                      !error.includes('被拒绝') &&
                      !error.includes('被封禁') &&
                      '登录失败'}
                  </p>
                  <p className='text-sm opacity-80 mt-1'>{error}</p>
                  {error.includes('审核中') && (
                    <p className='text-xs opacity-70 mt-2'>
                      💡 您的注册申请已提交，管理员将会尽快处理
                    </p>
                  )}
                  {error.includes('被拒绝') && (
                    <p className='text-xs opacity-70 mt-2'>
                      💡 如有疑问请联系管理员
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 登录按钮 */}
          <button
            type='submit'
            disabled={!password || loading || (shouldAskUsername && !username)}
            className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:from-green-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50'
          >
            {loading ? '登录中...' : '登录'}
          </button>

          {/* LinuxDo OAuth 登录按钮 */}
          {oauthEnabled && (
            <>
              <div className='flex items-center'>
                <div className='flex-1 border-t border-gray-300 dark:border-gray-600'></div>
                <div className='px-3 text-sm text-gray-500 dark:text-gray-400'>
                  或者
                </div>
                <div className='flex-1 border-t border-gray-300 dark:border-gray-600'></div>
              </div>

              <button
                type='button'
                onClick={handleOAuthLogin}
                className='inline-flex w-full justify-center items-center gap-3 rounded-lg bg-blue-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-blue-700'
              >
                <svg
                  className='w-5 h-5'
                  viewBox='0 0 24 24'
                  fill='currentColor'
                >
                  <path
                    d='M12 2L2 7L12 12L22 7L12 2ZM2 17L12 22L22 17M2 12L12 17L22 12'
                    stroke='currentColor'
                    strokeWidth='2'
                    fill='none'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                  />
                </svg>
                使用 LinuxDo 登录
              </button>
            </>
          )}

          {/* 注册链接 */}
          {registrationEnabled && storageType !== 'localstorage' && (
            <div className='text-center text-sm text-gray-600 dark:text-gray-400'>
              还没有账号？{' '}
              <button
                type='button'
                onClick={() => router.push('/register')}
                className='text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 underline'
              >
                立即注册
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPageClient />
    </Suspense>
  );
}
