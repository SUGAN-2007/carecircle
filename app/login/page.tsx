'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

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
    <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-8 sm:p-10 shadow-lg border-2 border-slate-200 dark:border-slate-800">
      <header className="text-center mb-8">
        <div aria-hidden="true" className="text-5xl mb-3">
          💊
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">CareCircle</h1>
        <p className="mt-2 text-lg text-slate-600 dark:text-slate-300">
          Sign in to your care circle
        </p>
      </header>

      {error && (
        <div
          id="login-error"
          role="alert"
          aria-live="polite"
          className="mb-6 p-4 rounded-2xl bg-red-100 dark:bg-red-950/80 border-2 border-red-500 text-red-900 dark:text-red-200 text-lg font-medium"
        >
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-xl">
              ⚠️
            </span>
            <span>{error}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div>
          <label
            htmlFor="profileCode"
            className="block text-xl font-bold mb-2 text-slate-800 dark:text-slate-200"
          >
            Profile Code
          </label>
          <p
            id="profileCode-desc"
            className="text-base text-slate-500 dark:text-slate-400 mb-2"
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
            className="w-full min-h-[56px] px-4 text-xl rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus-visible:ring-4 focus-visible:ring-blue-600 focus-visible:border-blue-600"
          />
        </div>

        <div>
          <label
            htmlFor="passcode"
            className="block text-xl font-bold mb-2 text-slate-800 dark:text-slate-200"
          >
            Your Secret Passcode
          </label>
          <p
            id="passcode-desc"
            className="text-base text-slate-500 dark:text-slate-400 mb-2"
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
              className="w-full min-h-[56px] px-4 pr-16 text-xl rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus-visible:ring-4 focus-visible:ring-blue-600 focus-visible:border-blue-600"
            />
            <button
              type="button"
              onClick={() => setShowPasscode(!showPasscode)}
              aria-label={showPasscode ? 'Hide passcode' : 'Show passcode as text'}
              className="absolute right-2 top-2 bottom-2 px-3 flex items-center justify-center text-base font-semibold text-blue-700 dark:text-blue-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {showPasscode ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full min-h-[56px] text-xl font-bold rounded-2xl bg-blue-700 hover:bg-blue-800 text-white shadow-md transition-colors duration-150 disabled:opacity-50 focus-visible:ring-4 focus-visible:ring-offset-2 focus-visible:ring-blue-600"
        >
          {loading ? 'Checking...' : 'Sign In'}
        </button>
      </form>

      <footer className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
        <p className="text-lg text-slate-600 dark:text-slate-400">
          Setting up CareCircle for the first time?
        </p>
        <Link
          href="/setup"
          className="inline-block mt-2 min-h-[48px] py-2 px-4 text-xl font-semibold text-blue-700 dark:text-blue-400 underline underline-offset-4 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-600"
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
      className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
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
