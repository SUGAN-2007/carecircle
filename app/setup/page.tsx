'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface Credentials {
  elderPasscode: string;
  caretakerPasscode: string;
  familyPasscode: string;
}

export default function SetupPage() {
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [emailElder, setEmailElder] = useState('');
  const [emailCaretaker, setEmailCaretaker] = useState('');
  const [emailFamily, setEmailFamily] = useState('');
  const [passcodeElder, setPasscodeElder] = useState('');
  const [passcodeCaretaker, setPasscodeCaretaker] = useState('');
  const [passcodeFamily, setPasscodeFamily] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdProfile, setCreatedProfile] = useState<{
    profileCode: string;
    credentials: Credentials;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (
      passcodeElder === passcodeCaretaker ||
      passcodeElder === passcodeFamily ||
      passcodeCaretaker === passcodeFamily
    ) {
      setError('Each role must have a different passcode for safety.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          timezone,
          emailElder: emailElder.trim(),
          emailCaretaker: emailCaretaker.trim(),
          emailFamily: emailFamily.trim(),
          passcodeElder: passcodeElder.trim(),
          passcodeCaretaker: passcodeCaretaker.trim(),
          passcodeFamily: passcodeFamily.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create profile. Please check the information.');
        setLoading(false);
        return;
      }

      setCreatedProfile({
        profileCode: data.profileCode,
        credentials: {
          elderPasscode: passcodeElder.trim(),
          caretakerPasscode: passcodeCaretaker.trim(),
          familyPasscode: passcodeFamily.trim(),
        },
      });
      setLoading(false);
    } catch {
      setError('Connection problem. Please try again.');
      setLoading(false);
    }
  };

  if (createdProfile) {
    return (
      <main
        id="main-content"
        className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
      >
        <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl p-8 sm:p-10 shadow-xl border-4 border-green-600 dark:border-green-500 space-y-6">
          <header className="text-center">
            <span aria-hidden="true" className="text-5xl block mb-2">
              🎉
            </span>
            <h1 className="text-3xl font-extrabold text-green-700 dark:text-green-400">
              Profile Created!
            </h1>
            <p className="mt-2 text-xl font-medium text-slate-700 dark:text-slate-300">
              Please write these down now.
            </p>
          </header>

          <div
            role="alert"
            className="p-4 bg-amber-100 dark:bg-amber-950/70 border-2 border-amber-600 text-amber-950 dark:text-amber-200 rounded-2xl text-lg font-medium"
          >
            ⚠️ For your security, these passcodes will <strong>never</strong> be shown
            again and cannot be emailed.
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl border-2 border-slate-300 dark:border-slate-700">
              <span className="block text-base font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Profile Code (Shared with all members)
              </span>
              <span className="block text-3xl font-mono font-extrabold text-blue-700 dark:text-blue-300 mt-1 select-all">
                {createdProfile.profileCode}
              </span>
            </div>

            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl border-2 border-slate-300 dark:border-slate-700">
              <span className="block text-base font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Elder Passcode (Full Control)
              </span>
              <span className="block text-2xl font-mono font-bold text-slate-900 dark:text-slate-100 mt-1 select-all">
                {createdProfile.credentials.elderPasscode}
              </span>
            </div>

            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl border-2 border-slate-300 dark:border-slate-700">
              <span className="block text-base font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Caretaker Passcode (Propose Changes)
              </span>
              <span className="block text-2xl font-mono font-bold text-slate-900 dark:text-slate-100 mt-1 select-all">
                {createdProfile.credentials.caretakerPasscode}
              </span>
            </div>

            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl border-2 border-slate-300 dark:border-slate-700">
              <span className="block text-base font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Family Passcode (View-Only)
              </span>
              <span className="block text-2xl font-mono font-bold text-slate-900 dark:text-slate-100 mt-1 select-all">
                {createdProfile.credentials.familyPasscode}
              </span>
            </div>
          </div>

          <div className="pt-4">
            <Link
              href="/login"
              className="w-full flex items-center justify-center min-h-[56px] text-xl font-bold rounded-2xl bg-green-700 hover:bg-green-800 text-white shadow-lg transition-colors duration-150 focus-visible:ring-4 focus-visible:ring-green-600"
            >
              I Have Written These Down — Go to Sign In
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      className="min-h-screen py-10 px-4 flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-8 sm:p-10 shadow-lg border-2 border-slate-200 dark:border-slate-800">
        <header className="text-center mb-8">
          <span aria-hidden="true" className="text-5xl block mb-2">
            🌱
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Create CareCircle Profile
          </h1>
          <p className="mt-2 text-lg text-slate-600 dark:text-slate-300">
            Set up one shared healthcare profile for you, your caretaker, and family.
          </p>
        </header>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-6 p-4 rounded-2xl bg-red-100 dark:bg-red-950 border-2 border-red-500 text-red-900 dark:text-red-200 text-lg font-medium"
          >
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 border-b pb-2 border-slate-200 dark:border-slate-800">
              1. Basic Information
            </h2>

            <div>
              <label
                htmlFor="name"
                className="block text-xl font-bold mb-1 text-slate-800 dark:text-slate-200"
              >
                Elder&apos;s Full Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Margaret Smith"
                className="w-full min-h-[52px] px-4 text-xl rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus-visible:ring-4 focus-visible:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="timezone"
                className="block text-xl font-bold mb-1 text-slate-800 dark:text-slate-200"
              >
                Timezone
              </label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full min-h-[52px] px-4 text-xl rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus-visible:ring-4 focus-visible:ring-blue-600"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST - +05:30)</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
                <option value="America/Chicago">America/Chicago (CST/CDT)</option>
                <option value="America/Denver">America/Denver (MST/MDT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                <option value="Asia/Dubai">Asia/Dubai (+04:00)</option>
                <option value="Asia/Singapore">Asia/Singapore (+08:00)</option>
                <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
              </select>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 border-b pb-2 border-slate-200 dark:border-slate-800">
              2. Notification Emails
            </h2>

            <div>
              <label
                htmlFor="emailElder"
                className="block text-xl font-bold mb-1 text-slate-800 dark:text-slate-200"
              >
                Elder Email (for reminders and approvals)
              </label>
              <input
                id="emailElder"
                type="email"
                required
                value={emailElder}
                onChange={(e) => setEmailElder(e.target.value)}
                placeholder="elder@example.com"
                className="w-full min-h-[52px] px-4 text-xl rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus-visible:ring-4 focus-visible:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="emailCaretaker"
                className="block text-xl font-bold mb-1 text-slate-800 dark:text-slate-200"
              >
                Caretaker Email (for schedule proposals &amp; missed doses)
              </label>
              <input
                id="emailCaretaker"
                type="email"
                required
                value={emailCaretaker}
                onChange={(e) => setEmailCaretaker(e.target.value)}
                placeholder="caretaker@example.com"
                className="w-full min-h-[52px] px-4 text-xl rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus-visible:ring-4 focus-visible:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="emailFamily"
                className="block text-xl font-bold mb-1 text-slate-800 dark:text-slate-200"
              >
                Family Email (for weekly digest &amp; escalation)
              </label>
              <input
                id="emailFamily"
                type="email"
                required
                value={emailFamily}
                onChange={(e) => setEmailFamily(e.target.value)}
                placeholder="family@example.com"
                className="w-full min-h-[52px] px-4 text-xl rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus-visible:ring-4 focus-visible:ring-blue-600"
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 border-b pb-2 border-slate-200 dark:border-slate-800">
              3. Passcodes (6 or more numbers)
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Each passcode must be unique. The Elder passcode has authority to approve
              changes.
            </p>

            <div>
              <label
                htmlFor="passcodeElder"
                className="block text-xl font-bold mb-1 text-slate-800 dark:text-slate-200"
              >
                Elder Passcode
              </label>
              <input
                id="passcodeElder"
                type="password"
                inputMode="numeric"
                required
                minLength={6}
                value={passcodeElder}
                onChange={(e) => setPasscodeElder(e.target.value)}
                placeholder="6+ digits"
                className="w-full min-h-[52px] px-4 text-xl rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus-visible:ring-4 focus-visible:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="passcodeCaretaker"
                className="block text-xl font-bold mb-1 text-slate-800 dark:text-slate-200"
              >
                Caretaker Passcode
              </label>
              <input
                id="passcodeCaretaker"
                type="password"
                inputMode="numeric"
                required
                minLength={6}
                value={passcodeCaretaker}
                onChange={(e) => setPasscodeCaretaker(e.target.value)}
                placeholder="6+ digits"
                className="w-full min-h-[52px] px-4 text-xl rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus-visible:ring-4 focus-visible:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="passcodeFamily"
                className="block text-xl font-bold mb-1 text-slate-800 dark:text-slate-200"
              >
                Family Passcode
              </label>
              <input
                id="passcodeFamily"
                type="password"
                inputMode="numeric"
                required
                minLength={6}
                value={passcodeFamily}
                onChange={(e) => setPasscodeFamily(e.target.value)}
                placeholder="6+ digits"
                className="w-full min-h-[52px] px-4 text-xl rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus-visible:ring-4 focus-visible:ring-blue-600"
              />
            </div>
          </section>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[56px] text-xl font-bold rounded-2xl bg-blue-700 hover:bg-blue-800 text-white shadow-lg transition-colors duration-150 disabled:opacity-50 focus-visible:ring-4 focus-visible:ring-blue-600"
          >
            {loading ? 'Creating Profile...' : 'Complete Profile Setup'}
          </button>
        </form>

        <footer className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
          <Link
            href="/login"
            className="text-lg font-semibold text-blue-700 dark:text-blue-400 underline underline-offset-4 rounded-xl py-2 px-3 focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Already have a profile code? Sign In
          </Link>
        </footer>
      </div>
    </main>
  );
}
