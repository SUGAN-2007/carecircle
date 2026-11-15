'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PillIcon, AlertCircleIcon, EyeIcon, EyeOffIcon } from '@/components/icons';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '';

  const [profileCode, setProfileCode] = useState('');
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const cleanCode = profileCode.trim().toUpperCase();
    const cleanPass = passcode.trim();

    if (!cleanCode) {
      setError('Please enter your Profile Code.');
      return;
    }

    if (!cleanPass || cleanPass.length < 6) {
      setError('Passcode must be at least 6 digits.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileCode: cleanCode,
          passcode: cleanPass,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Unable to sign in. Please check your credentials.');
        setLoading(false);
        return;
      }

      // Route according to role or intended redirect
      if (redirectPath && redirectPath.startsWith('/')) {
        router.push(redirectPath);
      } else {
        router.push(data.redirect || `/${data.role}`);
      }
    } catch {
      setError('Connection problem. Please check your internet connection.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg bg-white dark:bg-[#16223F] rounded-3xl p-8 sm:p-10 shadow-md border-2 border-slate-400 dark:border-slate-500">
      <header className="text-center mb-8">
        <div className="flex justify-center mb-3">
          <div className="w-16 h-16 rounded-2xl bg-sky-100 dark:bg-sky-950/80 border-2 border-sky-600 dark:border-sky-400 flex items-center justify-center text-sky-700 dark:text-sky-300">
            <PillIcon className="w-9 h-9" />
          </div>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          CareCircle
        </h1>
        <p className="mt-2 text-lg font-medium text-slate-700 dark:text-slate-300">
          Sign in to your care circle
        </p>
      </header>

      {error && (
        <div
          id="login-error"
          role="alert"
          aria-live="polite"
          className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/90 border-2 border-red-600 dark:border-red-500 text-red-950 dark:text-red-100 text-lg font-semibold"
        >
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="w-6 h-6 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div>
          <label
            htmlFor="profileCode"
            className="block text-xl font-bold mb-2 text-slate-900 dark:text-slate-100"
          >
            Profile Code
          </label>
          <p
            id="profileCode-desc"
            className="text-base font-medium text-slate-600 dark:text-slate-400 mb-2"
          >
            Enter the code shared with your family (for example: CC-A1B2-C3D4)
          </p>
          <input
            id="profileCode"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck="false"
            aria-describedby={
              error ? 'profileCode-desc login-error' : 'profileCode-desc'
            }
            value={profileCode}
            onChange={(e) => setProfileCode(e.target.value)}
            placeholder="CC-XXXX-XXXX"
            required
            className="w-full min-h-[56px] px-4 text-xl font-semibold rounded-2xl border-2 border-slate-500 dark:border-slate-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus-visible:ring-3 focus-visible:ring-offset-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 focus-visible:border-sky-600 transition-colors duration-150 motion-reduce:transition-none"
          />
        </div>

        <div>
          <label
            htmlFor="passcode"
            className="block text-xl font-bold mb-2 text-slate-900 dark:text-slate-100"
          >
            Your Secret Passcode
          </label>
          <p
            id="passcode-desc"
            className="text-base font-medium text-slate-600 dark:text-slate-400 mb-2"
          >
            Your personal 6-digit number (Elder, Caretaker, or Family)
          </p>
          <div className="relative">
            <input
              id="passcode"
              type={showPasscode ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete="current-password"
              aria-describedby="passcode-desc"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="6 or more digits"
              required
              className="w-full min-h-[56px] px-4 pr-24 text-xl font-semibold rounded-2xl border-2 border-slate-500 dark:border-slate-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus-visible:ring-3 focus-visible:ring-offset-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 focus-visible:border-sky-600 transition-colors duration-150 motion-reduce:transition-none"
            />
            <button
              type="button"
              onClick={() => setShowPasscode(!showPasscode)}
              aria-label={showPasscode ? 'Hide passcode' : 'Show passcode as text'}
              className="absolute right-2 top-2 bottom-2 px-3 flex items-center gap-1.5 text-base font-bold text-slate-800 dark:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-400 dark:border-slate-600 cursor-pointer focus-visible:ring-3 focus-visible:ring-sky-600 transition-colors duration-150 motion-reduce:transition-none"
            >
              {showPasscode ? (
                <>
                  <EyeOffIcon className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                  <span>Hide</span>
                </>
              ) : (
                <>
                  <EyeIcon className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                  <span>Show</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Primary Action Button: Green background with Black text per strict override */}
        <button
          type="submit"
          disabled={loading}
          className="w-full min-h-[56px] text-xl font-black rounded-2xl bg-[#22C55E] dark:bg-[#4ADE80] hover:bg-[#16A34A] dark:hover:bg-[#22C55E] text-[#000000] border-2 border-[#15803D] dark:border-[#22C55E] shadow-sm transition-colors duration-150 motion-reduce:transition-none disabled:opacity-50 cursor-pointer focus-visible:ring-3 focus-visible:ring-offset-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400"
        >
          {loading ? 'Checking...' : 'Sign In'}
        </button>
      </form>

      <footer className="mt-8 pt-6 border-t-2 border-slate-200 dark:border-slate-800 text-center">
        <p className="text-lg font-medium text-slate-700 dark:text-slate-300">
          Setting up CareCircle for the first time?
        </p>
        <Link
          href="/setup"
          className="inline-block mt-2 min-h-[48px] py-2 px-4 text-xl font-bold text-[#0369A1] dark:text-[#38BDF8] underline underline-offset-4 rounded-xl hover:bg-sky-50 dark:hover:bg-slate-800/60 cursor-pointer focus-visible:ring-3 focus-visible:ring-sky-600 transition-colors duration-150 motion-reduce:transition-none"
        >
          Create a New Profile
        </Link>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main
      id="main-content"
      className="min-h-screen flex items-center justify-center p-4 bg-[#F0F9FF] dark:bg-[#0B132B] text-slate-900 dark:text-slate-100"
    >
      <Suspense
        fallback={
          <div className="text-xl font-medium p-8 text-center" role="status">
            Loading sign in...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
