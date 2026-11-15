'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Medication } from '@/lib/medications';
import type { Appointment } from '@/lib/appointments';
import type { AdherenceStats } from '@/lib/adherence';

export default function FamilyDashboard() {
  const router = useRouter();

  const [adherenceDays, setAdherenceDays] = useState<7 | 30>(7);
  const [adherence, setAdherence] = useState<AdherenceStats | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [adhRes, medRes, apptRes] = await Promise.all([
        fetch(`/api/adherence?days=${adherenceDays}`),
        fetch('/api/medications'),
        fetch('/api/appointments'),
      ]);

      if (adhRes.status === 401 || medRes.status === 401 || apptRes.status === 401) {
        router.push('/login');
        return;
      }

      const [adhData, medData, apptData] = await Promise.all([
        adhRes.json(),
        medRes.json(),
        apptRes.json(),
      ]);

      setAdherence(adhData.adherence || null);
      setMedications(medData.medications || []);
      setAppointments(apptData.appointments || []);
    } catch {
      setError('Unable to load family dashboard. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [adherenceDays, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <main
      id="main-content"
      className="min-h-screen p-4 sm:p-8 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
    >
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Family View
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 mt-1">
              Read-only healthcare monitoring &amp; adherence
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="self-start sm:self-auto min-h-[48px] px-5 py-2 text-lg font-bold rounded-2xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 focus-visible:ring-4 focus-visible:ring-blue-600"
          >
            Sign Out
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-red-100 dark:bg-red-950/80 border-2 border-red-500 text-red-900 dark:text-red-200 text-lg font-bold"
          >
            ⚠️ {error}
          </div>
        )}

        {/* Adherence Stats */}
        <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold">📊 Adherence Summary</h2>
              <p className="text-lg text-slate-600 dark:text-slate-400">
                Track how consistently medications are taken
              </p>
            </div>
            <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
              <button
                onClick={() => setAdherenceDays(7)}
                className={`min-h-[48px] px-5 text-lg font-extrabold rounded-xl transition-all ${
                  adherenceDays === 7
                    ? 'bg-blue-700 text-white shadow'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                Last 7 Days
              </button>
              <button
                onClick={() => setAdherenceDays(30)}
                className={`min-h-[48px] px-5 text-lg font-extrabold rounded-xl transition-all ${
                  adherenceDays === 30
                    ? 'bg-blue-700 text-white shadow'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                Last 30 Days
              </button>
            </div>
          </div>

          {adherence && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900">
                <span className="block text-3xl font-extrabold text-blue-700 dark:text-blue-300">
                  {adherence.rate}%
                </span>
                <span className="text-base font-bold text-slate-600 dark:text-slate-400">
                  Adherence Rate
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-green-50 dark:bg-green-950/60 border border-green-200 dark:border-green-900">
                <span className="block text-3xl font-extrabold text-green-700 dark:text-green-300">
                  {adherence.taken}
                </span>
                <span className="text-base font-bold text-slate-600 dark:text-slate-400">
                  Taken
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900">
                <span className="block text-3xl font-extrabold text-amber-700 dark:text-amber-300">
                  {adherence.skipped}
                </span>
                <span className="text-base font-bold text-slate-600 dark:text-slate-400">
                  Skipped
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900">
                <span className="block text-3xl font-extrabold text-red-700 dark:text-red-300">
                  {adherence.missed}
                </span>
                <span className="text-base font-bold text-slate-600 dark:text-slate-400">
                  Missed
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Current Medications */}
        <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <h2 className="text-2xl font-extrabold">💊 Current Medications</h2>
          {loading ? (
            <p className="text-lg text-slate-500">Loading...</p>
          ) : medications.length === 0 ? (
            <p className="text-lg text-slate-600 dark:text-slate-400">
              No active medications on record.
            </p>
          ) : (
            <ul className="space-y-3">
              {medications.map((m) => (
                <li
                  key={m.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <span className="text-xl font-bold block">{m.name}</span>
                  <span className="text-base text-slate-600 dark:text-slate-400 block mt-1">
                    Dose: {m.dose} · Scheduled Times: {m.scheduleTimes.join(', ')} ·{' '}
                    {m.withFood ? 'With Food' : 'Water Only'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Upcoming Appointments */}
        <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <h2 className="text-2xl font-extrabold">📅 Upcoming Appointments</h2>
          {appointments.length === 0 ? (
            <p className="text-lg text-slate-600 dark:text-slate-400">
              No appointments scheduled.
            </p>
          ) : (
            <ul className="space-y-3">
              {appointments.map((a) => (
                <li
                  key={a.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <span className="text-xl font-bold block">{a.doctor}</span>
                  <span className="text-base text-slate-600 dark:text-slate-400 block mt-1">
                    📍 {a.place} · ⏰ {new Date(a.dateTime).toLocaleString()}
                  </span>
                  {a.notes && (
                    <span className="text-base italic text-slate-500 mt-1 block">
                      Note: {a.notes}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
