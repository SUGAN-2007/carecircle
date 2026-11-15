'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AuditRecord {
  id: string;
  actor: string;
  role: string;
  action: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export default function ElderAuditPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAudit = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/audit?limit=30');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to load history');
      const data = await res.json();
      setEntries(data.auditEntries || []);
    } catch {
      setError('Unable to load history. Please check connection.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const formatActionSentence = (item: AuditRecord): { icon: string; sentence: string } => {
    const actorName = item.actor === 'elder' ? 'You' : item.actor;
    const timeFormatted = new Date(item.timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    switch (item.action) {
      case 'change_proposed':
        return {
          icon: '📝',
          sentence: `Caretaker proposed a schedule change (${String(item.payload?.type || '')}) on ${timeFormatted}.`,
        };
      case 'change_approved':
        return {
          icon: '✅',
          sentence: `You approved a proposal on ${timeFormatted}.`,
        };
      case 'change_rejected':
        return {
          icon: '❌',
          sentence: `You rejected a proposal on ${timeFormatted}.`,
        };
      case 'change_cancelled':
        return {
          icon: '🚫',
          sentence: `Caretaker cancelled a proposed change on ${timeFormatted}.`,
        };
      case 'dose_taken':
        return {
          icon: '💊',
          sentence: `Dose for ${item.payload?.medicationName || 'medication'} marked as Taken on ${timeFormatted}.`,
        };
      case 'dose_skipped':
        return {
          icon: '⏭️',
          sentence: `Dose for ${item.payload?.medicationName || 'medication'} marked as Skipped on ${timeFormatted}.`,
        };
      case 'medication_created':
        return {
          icon: '➕',
          sentence: `New medication ${item.payload?.name || ''} added to your schedule on ${timeFormatted}.`,
        };
      case 'medication_deleted':
        return {
          icon: '🗑️',
          sentence: `Medication ${item.payload?.name || ''} removed on ${timeFormatted}.`,
        };
      case 'passcode_rotated':
        return {
          icon: '🔑',
          sentence: `Passcode rotated for ${item.payload?.targetRole || 'member'} on ${timeFormatted}.`,
        };
      case 'profile_created':
        return {
          icon: '🎉',
          sentence: `CareCircle profile created on ${timeFormatted}.`,
        };
      default:
        return {
          icon: '📌',
          sentence: `Action recorded: ${item.action.replace('_', ' ')} on ${timeFormatted}.`,
        };
    }
  };

  return (
    <main
      id="main-content"
      className="min-h-screen p-4 sm:p-8 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <nav className="flex items-center justify-between border-b-2 border-slate-200 dark:border-slate-800 pb-4">
          <Link
            href="/dashboard/elder"
            className="min-h-[48px] px-4 py-2 text-lg font-bold text-blue-700 dark:text-blue-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
          >
            ← Back to Today
          </Link>
          <Link
            href="/dashboard/elder/approvals"
            className="min-h-[48px] px-4 py-2 text-lg font-bold text-blue-700 dark:text-blue-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Approvals Screen →
          </Link>
        </nav>

        <header>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Activity History
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mt-1">
            An immutable record of the last 30 actions and decisions in your care circle.
          </p>
        </header>

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
            Loading activity history...
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="text-center py-16 px-6 bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 space-y-2">
            <span aria-hidden="true" className="text-5xl block">
              📖
            </span>
            <h2 className="text-2xl font-bold">No history recorded yet</h2>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <ul className="space-y-4">
            {entries.map((item) => {
              const { icon, sentence } = formatActionSentence(item);
              return (
                <li
                  key={item.id}
                  className="p-5 bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-200 dark:border-slate-800 shadow-sm flex items-start gap-4"
                >
                  <span aria-hidden="true" className="text-3xl select-none">
                    {icon}
                  </span>
                  <div className="flex-1">
                    <p className="text-xl font-medium text-slate-900 dark:text-slate-100">
                      {sentence}
                    </p>
                    <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mt-1">
                      Actor: {item.role} ({item.actor})
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
