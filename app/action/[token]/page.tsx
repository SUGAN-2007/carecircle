'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface ActionMetadata {
  valid: boolean;
  action: 'taken' | 'snooze' | 'skip';
  medicationName: string;
  doseLogId: string;
  error?: string;
}

export default function ActionConfirmationPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<ActionMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completedMessage, setCompletedMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadMeta() {
      try {
        const res = await fetch(`/api/action/${token}`);
        const data = await res.json();
        if (!isMounted) return;

        if (res.ok && data.valid) {
          setMeta(data);
        } else {
          setError(
            data.error ||
              'This one-tap link is invalid, expired, or has already been used.',
          );
        }
      } catch {
        if (isMounted) {
          setError('Unable to verify this link. Please check your network connection.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadMeta();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/action/${token}`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to apply action.');
      }

      setCompletedMessage(data.message || 'Action confirmed successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error applying action.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      id="main-content"
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 sm:p-8"
    >
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 p-8 sm:p-10 rounded-3xl border-2 border-slate-300 dark:border-slate-800 shadow-xl space-y-6 text-center">
        {/* Header */}
        <div>
          <div className="text-3xl font-extrabold text-blue-700 dark:text-blue-400">
            💊 CareCircle
          </div>
          <h1 className="text-2xl sm:text-3xl font-black mt-2">
            One-Tap Medication Action
          </h1>
        </div>

        {loading && (
          <div className="p-8 text-xl font-bold text-slate-600 dark:text-slate-400 animate-pulse">
            Verifying your request...
          </div>
        )}

        {completedMessage && (
          <div className="space-y-6">
            <div
              role="status"
              className="p-6 rounded-2xl bg-green-100 dark:bg-green-950/80 border-2 border-green-600 text-green-950 dark:text-green-200 text-xl font-bold"
            >
              ✅ {completedMessage}
            </div>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Your care team and schedule have been updated in real-time.
            </p>
            <Link
              href="/login"
              className="inline-block min-h-[52px] px-8 py-3 rounded-2xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-lg focus-visible:ring-4 focus-visible:ring-blue-600"
            >
              Go to CareCircle Dashboard
            </Link>
          </div>
        )}

        {!loading && !completedMessage && error && (
          <div className="space-y-6">
            <div
              role="alert"
              className="p-6 rounded-2xl bg-red-50 dark:bg-red-950/80 border-2 border-red-500 text-red-950 dark:text-red-200 text-lg font-bold text-left"
            >
              ⚠️ {error}
            </div>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Action links are valid for 2 hours and can only be used once. If you
              already took your medicine, you can verify it directly in the app.
            </p>
            <Link
              href="/login"
              className="inline-block min-h-[52px] px-8 py-3 rounded-2xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white font-extrabold text-lg focus-visible:ring-4 focus-visible:ring-blue-600"
            >
              Open CareCircle App
            </Link>
          </div>
        )}

        {!loading && !completedMessage && !error && meta && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border-2 border-slate-300 dark:border-slate-700 text-left">
              <span className="text-base font-bold text-slate-500 uppercase block">
                Selected Action
              </span>
              <span className="text-2xl font-extrabold block text-slate-900 dark:text-white capitalize mt-1">
                {meta.action === 'taken'
                  ? 'Mark as Taken'
                  : meta.action === 'snooze'
                  ? 'Snooze Reminder'
                  : 'Skip Dose'}
              </span>
              <div className="mt-3 text-lg text-slate-700 dark:text-slate-300">
                <strong>Medication:</strong> {meta.medicationName}
              </div>
            </div>

            <p className="text-lg text-slate-600 dark:text-slate-300">
              Please click below to confirm. This protects against automated email
              scanners and ensures accurate records.
            </p>

            {meta.action === 'taken' && (
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="w-full min-h-[64px] px-8 py-4 rounded-2xl bg-green-700 hover:bg-green-800 text-white text-2xl font-black shadow-lg transition-transform active:scale-95 focus-visible:ring-4 focus-visible:ring-green-600 disabled:opacity-50"
              >
                {submitting ? (
                  'Recording...'
                ) : (
                  <>
                    <span aria-hidden="true">✔</span> Yes, I Took This Dose
                  </>
                )}
              </button>
            )}

            {meta.action === 'snooze' && (
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="w-full min-h-[64px] px-8 py-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-2xl font-black shadow-lg transition-transform active:scale-95 focus-visible:ring-4 focus-visible:ring-amber-500 disabled:opacity-50"
              >
                {submitting ? (
                  'Snoozing...'
                ) : (
                  <>
                    <span aria-hidden="true">⏰</span> Snooze for 15 Minutes
                  </>
                )}
              </button>
            )}

            {meta.action === 'skip' && (
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="w-full min-h-[64px] px-8 py-4 rounded-2xl bg-slate-700 hover:bg-slate-800 text-white text-2xl font-black shadow-lg transition-transform active:scale-95 focus-visible:ring-4 focus-visible:ring-slate-500 disabled:opacity-50"
              >
                {submitting ? 'Recording...' : 'Skip This Dose'}
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
