'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PendingChange } from '@/lib/pendingChanges';

export default function ElderApprovalsPage() {
  const router = useRouter();
  const [proposals, setProposals] = useState<PendingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  const fetchProposals = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/pending');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to load pending proposals');
      const data = await res.json();
      // Filter for active pending proposals only
      const pendingOnly = (data.pendingChanges || []).filter(
        (p: PendingChange) => p.status === 'pending',
      );
      setProposals(pendingOnly);
    } catch {
      setError('Unable to fetch proposals. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const handleDecision = async (id: string, action: 'approve' | 'reject') => {
    setActingId(id);
    try {
      const res = await fetch(`/api/pending/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reason: action === 'reject' ? rejectReason.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action} proposal`);
      }

      const msg = action === 'approve' ? 'Proposal approved!' : 'Proposal rejected.';
      setAnnouncement(msg);
      setRejectingId(null);
      setRejectReason('');
      await fetchProposals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error processing decision');
    } finally {
      setActingId(null);
    }
  };

  return (
    <main
      id="main-content"
      className="min-h-screen p-4 sm:p-8 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Navigation Bar */}
        <nav className="flex items-center justify-between border-b-2 border-slate-200 dark:border-slate-800 pb-4">
          <Link
            href="/dashboard/elder"
            className="min-h-[48px] px-4 py-2 text-lg font-bold text-blue-700 dark:text-blue-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
          >
            ← Back to Today
          </Link>
          <Link
            href="/dashboard/elder/audit"
            className="min-h-[48px] px-4 py-2 text-lg font-bold text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            View History →
          </Link>
        </nav>

        <header>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Pending Approvals
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mt-1">
            Review changes proposed by your caretaker. Nothing changes without your decision.
          </p>
        </header>

        {/* Live Announcement */}
        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>

        {announcement && (
          <div
            role="status"
            className="p-4 rounded-2xl bg-green-100 dark:bg-green-950/80 border-2 border-green-600 text-green-900 dark:text-green-200 text-xl font-bold flex items-center justify-between"
          >
            <span>{announcement}</span>
            <button
              onClick={() => setAnnouncement('')}
              className="text-base underline ml-4 min-h-[48px] px-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-red-100 dark:bg-red-950 border-2 border-red-500 text-red-900 dark:text-red-200 text-xl font-bold"
          >
            ⚠️ {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-16 text-2xl font-bold text-slate-500">
            Checking for pending proposals...
          </div>
        )}

        {/* Empty State */}
        {!loading && proposals.length === 0 && (
          <div className="text-center py-16 px-6 bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 space-y-4">
            <span aria-hidden="true" className="text-6xl block">
              ✨
            </span>
            <h2 className="text-3xl font-extrabold">Nothing waiting for you</h2>
            <p className="text-xl text-slate-600 dark:text-slate-400">
              Your caretaker has not submitted any pending requests.
            </p>
            <div className="pt-4">
              <Link
                href="/dashboard/elder"
                className="inline-flex items-center min-h-[52px] px-6 text-xl font-bold bg-blue-700 text-white rounded-2xl"
              >
                Go to Today&apos;s Medications
              </Link>
            </div>
          </div>
        )}

        {/* Proposals Cards List */}
        {!loading && proposals.length > 0 && (
          <div className="space-y-6">
            {proposals.map((item) => {
              const isActing = actingId === item.id;
              const isRejectingThis = rejectingId === item.id;

              return (
                <article
                  key={item.id}
                  className="p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-3xl border-3 border-blue-400 dark:border-blue-700 shadow-md space-y-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-sm font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                        {item.type.replace('_', ' ').toUpperCase()}
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-extrabold mt-1 text-slate-900 dark:text-slate-100">
                        {item.type.startsWith('medication')
                          ? `Medication Proposal: ${item.payload.name || 'Schedule'}`
                          : `Appointment Proposal: ${item.payload.doctor || 'Visit'}`}
                      </h2>
                      <p className="text-base text-slate-500 dark:text-slate-400 mt-1">
                        Proposed by your caretaker on{' '}
                        {new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Proposal Details in Plain Language */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-slate-200 dark:border-slate-700 space-y-2 text-xl font-medium">
                    {item.type === 'medication_add' && (
                      <div>
                        <p>
                          Your caretaker wants to add{' '}
                          <strong>{String(item.payload.name)}</strong> ({String(item.payload.dose)}).
                        </p>
                        <p className="mt-1 text-lg text-slate-700 dark:text-slate-300">
                          ⏰ Scheduled at:{' '}
                          {Array.isArray(item.payload.scheduleTimes)
                            ? item.payload.scheduleTimes.join(', ')
                            : 'Daily'}
                        </p>
                        <p className="text-lg text-slate-700 dark:text-slate-300">
                          {item.payload.withFood ? '🍽️ Take with food' : '💧 Water only'}
                        </p>
                      </div>
                    )}

                    {item.type === 'medication_delete' && (
                      <p className="text-red-700 dark:text-red-400 font-bold">
                        ⚠️ Your caretaker proposes to remove this medication from your daily schedule.
                      </p>
                    )}

                    {item.type === 'appointment_add' && (
                      <div>
                        <p>
                          Doctor: <strong>{String(item.payload.doctor)}</strong>
                        </p>
                        <p className="text-lg">📍 Clinic: {String(item.payload.place)}</p>
                        <p className="text-lg">
                          ⏰ Time: {new Date(String(item.payload.dateTime)).toLocaleString()}
                        </p>
                        {Boolean(item.payload.notes) && (
                          <p className="text-base text-slate-500 mt-1 italic">
                            Note: {String(item.payload.notes)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Reject Reason Form Toggle */}
                  {isRejectingThis && (
                    <div className="p-4 bg-red-50 dark:bg-red-950/60 rounded-2xl border-2 border-red-300 dark:border-red-800 space-y-3">
                      <label htmlFor={`reason-${item.id}`} className="block text-lg font-bold text-red-900 dark:text-red-200">
                        Reason for rejection (optional note for caretaker):
                      </label>
                      <input
                        id={`reason-${item.id}`}
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="e.g. Doctor changed this prescription"
                        className="w-full min-h-[48px] px-3 rounded-xl border-2 border-slate-300 text-lg"
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleDecision(item.id, 'reject')}
                          disabled={isActing}
                          className="min-h-[48px] px-5 bg-red-700 text-white font-bold rounded-xl text-lg"
                        >
                          Confirm Rejection
                        </button>
                        <button
                          onClick={() => setRejectingId(null)}
                          className="min-h-[48px] px-4 bg-slate-200 dark:bg-slate-700 font-semibold rounded-xl text-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Big Approve & Reject Buttons */}
                  {!isRejectingThis && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <button
                        onClick={() => handleDecision(item.id, 'approve')}
                        disabled={isActing}
                        className="w-full min-h-[56px] text-xl font-extrabold rounded-2xl bg-green-700 hover:bg-green-800 text-white shadow-md transition-colors focus-visible:ring-4 focus-visible:ring-green-600 disabled:opacity-50"
                      >
                        {isActing ? (
                          'Processing...'
                        ) : (
                          <>
                            <span aria-hidden="true">✔</span> Approve Change
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => setRejectingId(item.id)}
                        disabled={isActing}
                        className="w-full min-h-[56px] text-xl font-bold rounded-2xl bg-red-100 dark:bg-red-950 hover:bg-red-200 dark:hover:bg-red-900 text-red-900 dark:text-red-200 border-2 border-red-500 transition-colors focus-visible:ring-4 focus-visible:ring-red-600 disabled:opacity-50"
                      >
                        <span aria-hidden="true">✕</span> Reject
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
