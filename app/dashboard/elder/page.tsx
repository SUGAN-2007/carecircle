'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface TodayDose {
  slotId: string;
  medicationId: string;
  medicationName: string;
  dose: string;
  withFood: boolean;
  pillCount: number;
  timeSlot: string;
  scheduledSlot: string;
  scheduledAt: string;
  status: 'pending' | 'taken' | 'skipped' | 'missed';
  canLog: boolean;
}

interface ExplanationState {
  name: string;
  summary: string;
  disclaimer: string;
}

export default function ElderTodayDashboard() {
  const router = useRouter();
  const [doses, setDoses] = useState<TodayDose[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>('');
  const [actingSlot, setActingSlot] = useState<string | null>(null);

  // Explanation state
  const [explainingMed, setExplainingMed] = useState<string | null>(null);
  const [activeExplanation, setActiveExplanation] = useState<ExplanationState | null>(null);

  const fetchDoses = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/doses/today');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        throw new Error('Unable to load medications');
      }
      const data = await res.json();
      setDoses(data.doses || []);
    } catch {
      setError('Could not load today’s medications. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchDoses();
  }, [fetchDoses]);

  const handleAction = async (dose: TodayDose, status: 'taken' | 'skipped') => {
    setActingSlot(dose.slotId);
    try {
      const res = await fetch(`/api/medications/${dose.medicationId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledSlot: dose.scheduledSlot,
          status,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update dose');
      }

      const statusText = status === 'taken' ? 'Marked as taken' : 'Marked as skipped';
      setAnnouncement(`${dose.medicationName} ${statusText}.`);

      // Refresh doses
      await fetchDoses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating dose status');
    } finally {
      setActingSlot(null);
    }
  };

  const handleExplain = async (medName: string) => {
    setExplainingMed(medName);
    setError(null);

    try {
      const res = await fetch(`/api/gemini/explain?name=${encodeURIComponent(medName)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to load explanation');
      }

      setActiveExplanation({
        name: medName,
        summary: data.summary,
        disclaimer: data.disclaimer,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error getting explanation');
    } finally {
      setExplainingMed(null);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <main
      id="main-content"
      className="min-h-screen p-4 sm:p-8 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Today&apos;s Medications
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-300 mt-1">
              {new Date().toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="self-start sm:self-auto min-h-[48px] px-5 py-2 text-lg font-bold rounded-2xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 focus-visible:ring-4 focus-visible:ring-blue-600"
          >
            Sign Out
          </button>
        </header>

        {/* Quick Navigation Action Chips */}
        <nav
          aria-label="Elder Dashboard Tools"
          className="flex flex-wrap gap-2 pt-1 pb-2"
        >
          <Link
            href="/dashboard/elder/nl-add"
            className="min-h-[48px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-purple-100 dark:bg-purple-950/80 text-purple-900 dark:text-purple-200 font-bold border-2 border-purple-400 hover:bg-purple-200 focus-visible:ring-4 focus-visible:ring-purple-600"
          >
            🎙️ Smart Add with AI
          </Link>
          <Link
            href="/dashboard/elder/approvals"
            className="min-h-[48px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-blue-100 dark:bg-blue-950/80 text-blue-900 dark:text-blue-200 font-bold border-2 border-blue-400 hover:bg-blue-200 focus-visible:ring-4 focus-visible:ring-blue-600"
          >
            📋 Approvals
          </Link>
          <Link
            href="/dashboard/elder/escalation"
            className="min-h-[48px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 font-bold border-2 border-amber-400 hover:bg-amber-200 focus-visible:ring-4 focus-visible:ring-amber-600"
          >
            🚨 Escalation
          </Link>
          <Link
            href="/dashboard/elder/audit"
            className="min-h-[48px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold border-2 border-slate-300 dark:border-slate-700 hover:bg-slate-300 focus-visible:ring-4 focus-visible:ring-slate-600"
          >
            📜 Activity Log
          </Link>
        </nav>

        {/* Screen Reader Live Region */}
        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>

        {/* Visible Announcement Banner */}
        {announcement && (
          <div
            role="status"
            className="p-4 rounded-2xl bg-green-100 dark:bg-green-950/80 border-2 border-green-600 text-green-900 dark:text-green-200 text-xl font-bold flex items-center justify-between"
          >
            <span>✅ {announcement}</span>
            <button
              onClick={() => setAnnouncement('')}
              className="text-base underline ml-4 min-h-[48px] px-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-red-100 dark:bg-red-950/80 border-2 border-red-500 text-red-900 dark:text-red-200 text-xl font-bold flex flex-col gap-2"
          >
            <span>⚠️ {error}</span>
            <button
              onClick={fetchDoses}
              className="self-start mt-2 min-h-[48px] px-4 py-2 bg-red-800 text-white rounded-xl text-lg font-semibold"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Active AI Explanation Modal / Card */}
        {activeExplanation && (
          <div
            role="dialog"
            aria-labelledby="explainTitle"
            className="p-6 rounded-3xl bg-blue-50 dark:bg-blue-950/90 border-3 border-blue-600 text-slate-900 dark:text-slate-100 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 id="explainTitle" className="text-2xl font-black text-blue-900 dark:text-blue-200">
                ℹ️ About {activeExplanation.name}
              </h2>
              <button
                onClick={() => setActiveExplanation(null)}
                className="min-h-[48px] px-4 py-1 text-base font-bold bg-white dark:bg-slate-800 rounded-xl border border-blue-300"
              >
                Close <span aria-hidden="true">✕</span>
              </button>
            </div>
            <p className="text-xl font-medium leading-relaxed">
              {activeExplanation.summary}
            </p>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 text-amber-900 dark:text-amber-200 text-sm font-semibold">
              {activeExplanation.disclaimer}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div
            role="status"
            className="text-center py-16 text-2xl font-bold text-slate-600 dark:text-slate-400"
          >
            Loading your schedule...
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && doses.length === 0 && (
          <div className="text-center py-16 px-6 bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 space-y-4">
            <span aria-hidden="true" className="text-6xl block">
              ☀️
            </span>
            <h2 className="text-2xl font-bold">No medications scheduled for today</h2>
            <p className="text-xl text-slate-600 dark:text-slate-400">
              You are all caught up. Have a peaceful, restful day!
            </p>
          </div>
        )}

        {/* Dose Cards List */}
        {!loading && doses.length > 0 && (
          <div className="space-y-6">
            {doses.map((dose) => {
              const isActing = actingSlot === dose.slotId;
              const isLogged = dose.status === 'taken' || dose.status === 'skipped';
              const isExplainingThis = explainingMed === dose.medicationName;

              return (
                <article
                  key={dose.slotId}
                  className={`p-6 sm:p-8 rounded-3xl border-3 shadow-md bg-white dark:bg-slate-900 transition-all ${
                    dose.status === 'taken'
                      ? 'border-green-600 dark:border-green-500'
                      : dose.status === 'skipped'
                      ? 'border-amber-500 dark:border-amber-400'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <span className="inline-block text-2xl font-extrabold text-blue-700 dark:text-blue-300 mb-1">
                        ⏰ {dose.timeSlot}
                      </span>
                      <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                        {dose.medicationName}
                      </h2>
                      <p className="text-xl font-bold text-slate-700 dark:text-slate-300 mt-1">
                        Dose: {dose.dose}
                      </p>
                    </div>

                    {/* Status Badge (Text + Icon) */}
                    <div>
                      {dose.status === 'taken' && (
                        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300 text-lg font-extrabold border-2 border-green-600">
                          ✅ Taken
                        </span>
                      )}
                      {dose.status === 'skipped' && (
                        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-lg font-extrabold border-2 border-amber-600">
                          ⏭️ Skipped
                        </span>
                      )}
                      {dose.status === 'pending' && (
                        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-lg font-bold border-2 border-blue-400">
                          ⏳ Due
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Food instruction note & AI Explain button */}
                  <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-lg font-medium text-slate-800 dark:text-slate-200">
                    <span>
                      {dose.withFood
                        ? '🍽️ Take with food or a meal'
                        : '💧 Take with a glass of water'}
                    </span>
                    <button
                      onClick={() => handleExplain(dose.medicationName)}
                      disabled={isExplainingThis}
                      className="min-h-[44px] px-3 py-1 rounded-xl text-base font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-900 dark:text-purple-200 border border-purple-300 hover:bg-purple-200 focus-visible:ring-4 focus-visible:ring-purple-600 self-start sm:self-auto"
                    >
                      {isExplainingThis ? (
                        'Explaining...'
                      ) : (
                        <>
                          <span aria-hidden="true">💡</span> What is this pill?
                        </>
                      )}
                    </button>
                  </div>

                  {/* Primary & Secondary Action Buttons */}
                  {!isLogged ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button
                        onClick={() => handleAction(dose, 'taken')}
                        disabled={isActing || !dose.canLog}
                        className="w-full min-h-[56px] text-xl font-extrabold rounded-2xl bg-green-700 hover:bg-green-800 text-white shadow-md transition-colors focus-visible:ring-4 focus-visible:ring-green-600 disabled:opacity-50"
                      >
                        {isActing ? (
                          'Saving...'
                        ) : (
                          <>
                            <span aria-hidden="true">✔</span> Taken
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleAction(dose, 'skipped')}
                        disabled={isActing || !dose.canLog}
                        className="w-full min-h-[56px] text-xl font-bold rounded-2xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-2 border-slate-400 dark:border-slate-600 transition-colors focus-visible:ring-4 focus-visible:ring-blue-600 disabled:opacity-50"
                      >
                        {isActing ? 'Saving...' : 'Skip Dose'}
                      </button>
                    </div>
                  ) : (
                    <p className="text-lg font-semibold text-slate-600 dark:text-slate-400 text-center py-2">
                      Completed for this time slot
                    </p>
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
