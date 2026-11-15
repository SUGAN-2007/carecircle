'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { UserIcon, CheckCircleIcon, AlertCircleIcon, ShieldCheckIcon } from '@/components/icons';

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
        className="min-h-screen flex items-center justify-center p-4 bg-[#F0F9FF] dark:bg-[#0B132B] text-slate-900 dark:text-slate-100"
      >
        <div className="w-full max-w-xl bg-white dark:bg-[#16223F] rounded-3xl p-8 sm:p-10 shadow-lg border-2 border-slate-400 dark:border-slate-500 space-y-6">
          <header className="text-center">
            <div className="flex justify-center mb-3">
              <div className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-950/80 border-2 border-green-600 dark:border-green-400 flex items-center justify-center text-green-700 dark:text-green-300">
                <CheckCircleIcon className="w-10 h-10" />
              </div>
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
              Profile Created!
            </h1>
            <p className="mt-2 text-xl font-medium text-slate-700 dark:text-slate-300">
              Please write these down now.
            </p>
          </header>

          <div
            role="alert"
            className="p-4 bg-amber-50 dark:bg-amber-950/80 border-2 border-amber-600 dark:border-amber-500 text-amber-950 dark:text-amber-100 rounded-2xl text-lg font-semibold flex items-start gap-3"
          >
            <AlertCircleIcon className="w-6 h-6 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <span>
              For your security, these passcodes will <strong>never</strong> be shown
              again and cannot be emailed.
            </span>
          </div>

          <div className="space-y-4">
            <div className="p-5 bg-sky-50 dark:bg-sky-950/50 rounded-2xl border-2 border-sky-400 dark:border-sky-600">
              <span className="block text-base font-bold text-sky-800 dark:text-sky-300 uppercase tracking-wider">
                Profile Code (Shared with all members)
              </span>
              <span className="block text-3xl font-mono font-black text-sky-900 dark:text-sky-100 mt-1 select-all">
                {createdProfile.profileCode}
              </span>
            </div>

            <div className="p-5 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border-2 border-slate-400 dark:border-slate-600">
              <span className="block text-base font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Elder Passcode (Full Control)
              </span>
              <span className="block text-2xl font-mono font-extrabold text-slate-950 dark:text-slate-50 mt-1 select-all">
                {createdProfile.credentials.elderPasscode}
              </span>
            </div>

            <div className="p-5 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border-2 border-slate-400 dark:border-slate-600">
              <span className="block text-base font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Caretaker Passcode (Propose Changes)
              </span>
              <span className="block text-2xl font-mono font-extrabold text-slate-950 dark:text-slate-50 mt-1 select-all">
                {createdProfile.credentials.caretakerPasscode}
              </span>
            </div>

            <div className="p-5 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border-2 border-slate-400 dark:border-slate-600">
              <span className="block text-base font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Family Passcode (View-Only)
              </span>
              <span className="block text-2xl font-mono font-extrabold text-slate-950 dark:text-slate-50 mt-1 select-all">
                {createdProfile.credentials.familyPasscode}
              </span>
            </div>
          </div>

          <div className="pt-4">
            <Link
              href="/login"
              className="w-full flex items-center justify-center min-h-[56px] text-xl font-black rounded-2xl bg-[#22C55E] dark:bg-[#4ADE80] hover:bg-[#16A34A] dark:hover:bg-[#22C55E] text-[#000000] border-2 border-[#15803D] dark:border-[#22C55E] shadow-sm transition-colors duration-150 motion-reduce:transition-none cursor-pointer focus-visible:ring-3 focus-visible:ring-offset-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400"
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
      className="min-h-screen py-10 px-4 flex items-center justify-center bg-[#F0F9FF] dark:bg-[#0B132B] text-slate-900 dark:text-slate-100"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-[#16223F] rounded-3xl p-8 sm:p-10 shadow-md border-2 border-slate-400 dark:border-slate-500">
        <header className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 rounded-2xl bg-sky-100 dark:bg-sky-950/80 border-2 border-sky-600 dark:border-sky-400 flex items-center justify-center text-sky-700 dark:text-sky-300">
              <UserIcon className="w-9 h-9" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            Create CareCircle Profile
          </h1>
          <p className="mt-2 text-lg font-medium text-slate-700 dark:text-slate-300">
            Set up one shared healthcare profile for you, your caretaker, and family.
          </p>
        </header>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/90 border-2 border-red-600 dark:border-red-500 text-red-950 dark:text-red-100 text-lg font-semibold flex items-start gap-3"
          >
            <AlertCircleIcon className="w-6 h-6 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b-2 pb-2 border-slate-300 dark:border-slate-700">
              <UserIcon className="w-6 h-6 text-sky-700 dark:text-sky-400" />
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                1. Basic Information
              </h2>
            </div>

            <div>
              <label
                htmlFor="name"
                className="block text-xl font-bold mb-1 text-slate-900 dark:text-slate-100"
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
                className="w-full min-h-[52px] px-4 text-xl font-semibold rounded-2xl border-2 border-slate-500 dark:border-slate-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus-visible:ring-3 focus-visible:ring-offset-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 focus-visible:border-sky-600 transition-colors duration-150 motion-reduce:transition-none"
              />
            </div>

            <div>
              <label
                htmlFor="timezone"
                className="block text-xl font-bold mb-1 text-slate-900 dark:text-slate-100"
              >
                Timezone
              </label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full min-h-[52px] px-4 text-xl font-semibold rounded-2xl border-2 border-slate-500 dark:border-slate-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus-visible:ring-3 focus-visible:ring-offset-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 focus-visible:border-sky-600 transition-colors duration-150 motion-reduce:transition-none"
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
            <div className="flex items-center gap-2 border-b-2 pb-2 border-slate-300 dark:border-slate-700">
              <ShieldCheckIcon className="w-6 h-6 text-sky-700 dark:text-sky-400" />
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                2. Notification Emails
              </h2>
            </div>

            <div>
              <label
                htmlFor="emailElder"
                className="block text-xl font-bold mb-1 text-slate-900 dark:text-slate-100"
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
                className="w-full min-h-[52px] px-4 text-xl font-semibold rounded-2xl border-2 border-slate-500 dark:border-slate-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus-visible:ring-3 focus-visible:ring-offset-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 focus-visible:border-sky-600 transition-colors duration-150 motion-reduce:transition-none"
              />
            </div>

            <div>
              <label
                htmlFor="emailCaretaker"
                className="block text-xl font-bold mb-1 text-slate-900 dark:text-slate-100"
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
                className="w-full min-h-[52px] px-4 text-xl font-semibold rounded-2xl border-2 border-slate-500 dark:border-slate-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus-visible:ring-3 focus-visible:ring-offset-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 focus-visible:border-sky-600 transition-colors duration-150 motion-reduce:transition-none"
              />
            </div>

            <div>
              <label
                htmlFor="emailFamily"
                className="block text-xl font-bold mb-1 text-slate-900 dark:text-slate-100"
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
                className="w-full min-h-[52px] px-4 text-xl font-semibold rounded-2xl border-2 border-slate-500 dark:border-slate-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus-visible:ring-3 focus-visible:ring-offset-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 focus-visible:border-sky-600 transition-colors duration-150 motion-reduce:transition-none"
              />
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b-2 pb-2 border-slate-300 dark:border-slate-700">
              <ShieldCheckIcon className="w-6 h-6 text-sky-700 dark:text-sky-400" />
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                3. Passcodes (6 or more numbers)
              </h2>
            </div>
            <p className="text-lg font-medium text-slate-700 dark:text-slate-300">
              Each passcode must be unique. The Elder passcode has authority to approve
              changes.
            </p>

            <div>
              <label
                htmlFor="passcodeElder"
                className="block text-xl font-bold mb-1 text-slate-900 dark:text-slate-100"
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
                className="w-full min-h-[52px] px-4 text-xl font-semibold rounded-2xl border-2 border-slate-500 dark:border-slate-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus-visible:ring-3 focus-visible:ring-offset-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 focus-visible:border-sky-600 transition-colors duration-150 motion-reduce:transition-none"
              />
            </div>

            <div>
              <label
                htmlFor="passcodeCaretaker"
                className="block text-xl font-bold mb-1 text-slate-900 dark:text-slate-100"
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
                className="w-full min-h-[52px] px-4 text-xl font-semibold rounded-2xl border-2 border-slate-500 dark:border-slate-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus-visible:ring-3 focus-visible:ring-offset-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 focus-visible:border-sky-600 transition-colors duration-150 motion-reduce:transition-none"
              />
            </div>

            <div>
              <label
                htmlFor="passcodeFamily"
                className="block text-xl font-bold mb-1 text-slate-900 dark:text-slate-100"
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
                className="w-full min-h-[52px] px-4 text-xl font-semibold rounded-2xl border-2 border-slate-500 dark:border-slate-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus-visible:ring-3 focus-visible:ring-offset-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 focus-visible:border-sky-600 transition-colors duration-150 motion-reduce:transition-none"
              />
            </div>
          </section>

          {/* Primary Action Button: Green background with Black text per strict override */}
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[56px] text-xl font-black rounded-2xl bg-[#22C55E] dark:bg-[#4ADE80] hover:bg-[#16A34A] dark:hover:bg-[#22C55E] text-[#000000] border-2 border-[#15803D] dark:border-[#22C55E] shadow-sm transition-colors duration-150 motion-reduce:transition-none disabled:opacity-50 cursor-pointer focus-visible:ring-3 focus-visible:ring-offset-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400"
          >
            {loading ? 'Creating Profile...' : 'Complete Profile Setup'}
          </button>
        </form>

        <footer className="mt-8 pt-6 border-t-2 border-slate-200 dark:border-slate-800 text-center">
          <Link
            href="/login"
            className="text-lg font-bold text-[#0369A1] dark:text-[#38BDF8] underline underline-offset-4 rounded-xl py-2 px-3 hover:bg-sky-50 dark:hover:bg-slate-800/60 cursor-pointer focus-visible:ring-3 focus-visible:ring-sky-600 transition-colors duration-150 motion-reduce:transition-none"
          >
            Already have a profile code? Sign In
          </Link>
        </footer>
      </div>
    </main>
  );
}
