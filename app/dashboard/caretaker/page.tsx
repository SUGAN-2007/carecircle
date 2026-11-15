'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Medication } from '@/lib/medications';
import type { Appointment } from '@/lib/appointments';
import type { AdherenceStats } from '@/lib/adherence';
import type { PendingChange } from '@/lib/pendingChanges';

export default function CaretakerDashboard() {
  const router = useRouter();

  // State
  const [adherenceDays, setAdherenceDays] = useState<7 | 30>(7);
  const [adherence, setAdherence] = useState<AdherenceStats | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // New Medication Form State
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [medTimes, setMedTimes] = useState('08:00');
  const [medWithFood, setMedWithFood] = useState(false);
  const [medStartDate, setMedStartDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [medPillCount, setMedPillCount] = useState('30');
  const [submittingMed, setSubmittingMed] = useState(false);

  // New Appointment Form State
  const [apptDoctor, setApptDoctor] = useState('');
  const [apptPlace, setApptPlace] = useState('');
  const [apptDateTime, setApptDateTime] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [submittingAppt, setSubmittingAppt] = useState(false);

  // Cancelling proposal state
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [adhRes, medRes, apptRes, pendingRes] = await Promise.all([
        fetch(`/api/adherence?days=${adherenceDays}`),
        fetch('/api/medications'),
        fetch('/api/appointments'),
        fetch('/api/pending'),
      ]);

      if (
        adhRes.status === 401 ||
        medRes.status === 401 ||
        apptRes.status === 401 ||
        pendingRes.status === 401
      ) {
        router.push('/login');
        return;
      }

      const [adhData, medData, apptData, pendingData] = await Promise.all([
        adhRes.json(),
        medRes.json(),
        apptRes.json(),
        pendingRes.json(),
      ]);

      setAdherence(adhData.adherence || null);
      setMedications(medData.medications || []);
      setAppointments(apptData.appointments || []);
      setPendingChanges(pendingData.pendingChanges || []);
    } catch {
      setError('Unable to fetch caretaker dashboard data. Please check connection.');
    } finally {
      setLoading(false);
    }
  }, [adherenceDays, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleProposeMed = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingMed(true);
    setError(null);
    setNotice(null);

    const times = medTimes
      .split(',')
      .map((t) => t.trim())
      .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));

    if (times.length === 0) {
      setError('Please provide at least one valid schedule time in HH:mm format.');
      setSubmittingMed(false);
      return;
    }

    try {
      const res = await fetch('/api/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: medName.trim(),
          dose: medDose.trim(),
          scheduleTimes: times,
          withFood: medWithFood,
          startDate: medStartDate,
          pillCount: parseInt(medPillCount, 10) || 0,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit proposal');

      setNotice('✅ Proposed medication added! Awaiting Elder approval.');
      setMedName('');
      setMedDose('');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error submitting proposal');
    } finally {
      setSubmittingMed(false);
    }
  };

  const handleProposeAppt = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingAppt(true);
    setError(null);
    setNotice(null);

    if (!apptDateTime) {
      setError('Please select appointment date and time.');
      setSubmittingAppt(false);
      return;
    }

    try {
      const isoDateTime = new Date(apptDateTime).toISOString();
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor: apptDoctor.trim(),
          place: apptPlace.trim(),
          dateTime: isoDateTime,
          notes: apptNotes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to propose appointment');

      setNotice('✅ Proposed appointment added! Awaiting Elder approval.');
      setApptDoctor('');
      setApptPlace('');
      setApptDateTime('');
      setApptNotes('');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error submitting appointment');
    } finally {
      setSubmittingAppt(false);
    }
  };

  const handleCancelProposal = async (id: string) => {
    setCancellingId(id);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/pending/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel proposal');

      setNotice('Proposal successfully cancelled.');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cancelling proposal');
    } finally {
      setCancellingId(null);
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
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Caretaker Dashboard
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 mt-1">
              Collaborative management &amp; adherence oversight
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="self-start sm:self-auto min-h-[48px] px-5 py-2 text-lg font-bold rounded-2xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 focus-visible:ring-4 focus-visible:ring-blue-600"
          >
            Sign Out
          </button>
        </header>

        {notice && (
          <div
            role="status"
            className="p-4 rounded-2xl bg-green-100 dark:bg-green-950/80 border-2 border-green-600 text-green-900 dark:text-green-200 text-lg font-bold"
          >
            {notice}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-red-100 dark:bg-red-950/80 border-2 border-red-500 text-red-900 dark:text-red-200 text-lg font-bold"
          >
            ⚠️ {error}
          </div>
        )}

        {/* 1. Adherence Overview */}
        <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold">📊 Adherence Tracking</h2>
              <p className="text-lg text-slate-600 dark:text-slate-400">
                Consistency of taken versus missed doses
              </p>
            </div>
            {/* 7 vs 30 Days Toggle */}
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
                  Doses Taken
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900">
                <span className="block text-3xl font-extrabold text-red-700 dark:text-red-300">
                  {adherence.missed}
                </span>
                <span className="text-base font-bold text-slate-600 dark:text-slate-400">
                  Doses Missed
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="block text-3xl font-extrabold text-slate-700 dark:text-slate-300">
                  {adherence.skipped}
                </span>
                <span className="text-base font-bold text-slate-600 dark:text-slate-400">
                  Doses Skipped
                </span>
              </div>
            </div>
          )}
        </section>

        {/* 2. Proposal History */}
        <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-extrabold">📝 Proposal Status &amp; History</h2>
              <p className="text-lg text-slate-600 dark:text-slate-400">
                Track changes submitted to the Elder for review
              </p>
            </div>
          </div>

          {loading ? (
            <p className="text-lg text-slate-500">Loading proposals...</p>
          ) : pendingChanges.length === 0 ? (
            <p className="text-lg text-slate-600 dark:text-slate-400 italic">
              No recent proposals recorded.
            </p>
          ) : (
            <ul className="space-y-4">
              {pendingChanges.map((change) => {
                const isPending = change.status === 'pending';
                const statusColor =
                  change.status === 'approved'
                    ? 'bg-green-100 text-green-900 border-green-300 dark:bg-green-950 dark:text-green-200'
                    : change.status === 'rejected'
                    ? 'bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200'
                    : change.status === 'cancelled'
                    ? 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300'
                    : 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200';

                return (
                  <li
                    key={change.id}
                    className="p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="font-extrabold text-xl capitalize">
                          {change.type.replace('_', ' ')}
                        </span>
                        <span
                          className={`px-3 py-0.5 text-sm font-extrabold rounded-full border ${statusColor}`}
                        >
                          {change.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-base text-slate-700 dark:text-slate-300">
                        {change.payload.name
                          ? `${change.payload.name} (${change.payload.dose || ''})`
                          : change.payload.doctor
                          ? `Dr. ${change.payload.doctor} at ${change.payload.place}`
                          : JSON.stringify(change.payload)}
                      </p>
                      <p className="text-sm text-slate-500">
                        Submitted: {new Date(change.createdAt).toLocaleString()}
                        {change.rejectionReason && ` · Reason: ${change.rejectionReason}`}
                      </p>
                    </div>

                    {isPending && (
                      <button
                        onClick={() => handleCancelProposal(change.id)}
                        disabled={cancellingId === change.id}
                        className="min-h-[48px] px-5 text-base font-bold rounded-xl border-2 border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 focus-visible:ring-4 focus-visible:ring-red-500 disabled:opacity-50"
                      >
                        {cancellingId === change.id ? 'Cancelling...' : 'Cancel Proposal'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 3. Medications Management */}
        <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <h2 className="text-2xl font-extrabold">💊 Active Medications</h2>

          {medications.length === 0 ? (
            <p className="text-lg text-slate-600 dark:text-slate-400">
              No active medications on file.
            </p>
          ) : (
            <ul className="space-y-3">
              {medications.map((m) => (
                <li
                  key={m.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <span className="text-xl font-bold block">{m.name}</span>
                    <span className="text-base text-slate-600 dark:text-slate-400 block">
                      Dose: {m.dose} · Schedule: {m.scheduleTimes.join(', ')} ·{' '}
                      {m.withFood ? 'With Food' : 'Without Food'}
                    </span>
                  </div>
                  <span className="text-base font-bold text-slate-700 dark:text-slate-300">
                    📦 {m.pillCount} pills left
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Propose Medication Form */}
          <form
            onSubmit={handleProposeMed}
            className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4"
          >
            <h3 className="text-xl font-bold text-blue-700 dark:text-blue-400">
              + Propose Medication (Requires Elder Approval)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="medName" className="block text-base font-bold mb-1">
                  Medication Name
                </label>
                <input
                  id="medName"
                  type="text"
                  required
                  placeholder="e.g. Lisinopril"
                  value={medName}
                  onChange={(e) => setMedName(e.target.value)}
                  className="w-full min-h-[50px] px-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-lg"
                />
              </div>

              <div>
                <label htmlFor="medDose" className="block text-base font-bold mb-1">
                  Dose (strength / instructions)
                </label>
                <input
                  id="medDose"
                  type="text"
                  required
                  placeholder="e.g. 10mg once daily"
                  value={medDose}
                  onChange={(e) => setMedDose(e.target.value)}
                  className="w-full min-h-[50px] px-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-lg"
                />
              </div>

              <div>
                <label htmlFor="medTimes" className="block text-base font-bold mb-1">
                  Schedule Times (comma-separated HH:mm)
                </label>
                <input
                  id="medTimes"
                  type="text"
                  required
                  placeholder="08:00, 20:00"
                  value={medTimes}
                  onChange={(e) => setMedTimes(e.target.value)}
                  className="w-full min-h-[50px] px-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-lg"
                />
              </div>

              <div>
                <label htmlFor="medPillCount" className="block text-base font-bold mb-1">
                  Pill Count
                </label>
                <input
                  id="medPillCount"
                  type="number"
                  min="0"
                  required
                  value={medPillCount}
                  onChange={(e) => setMedPillCount(e.target.value)}
                  className="w-full min-h-[50px] px-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-lg"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="medWithFood"
                type="checkbox"
                checked={medWithFood}
                onChange={(e) => setMedWithFood(e.target.checked)}
                className="w-6 h-6 rounded"
              />
              <label htmlFor="medWithFood" className="text-lg font-bold">
                Take with food
              </label>
            </div>

            <button
              type="submit"
              disabled={submittingMed}
              className="min-h-[50px] px-6 text-lg font-bold rounded-xl bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50"
            >
              {submittingMed ? 'Submitting...' : 'Submit Proposal for Elder'}
            </button>
          </form>
        </section>

        {/* 4. Appointments Management */}
        <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <h2 className="text-2xl font-extrabold">📅 Appointments</h2>

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
                  <span className="text-base text-slate-600 dark:text-slate-400 block">
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

          {/* Propose Appointment Form */}
          <form
            onSubmit={handleProposeAppt}
            className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4"
          >
            <h3 className="text-xl font-bold text-blue-700 dark:text-blue-400">
              + Propose Appointment (Requires Elder Approval)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="apptDoctor" className="block text-base font-bold mb-1">
                  Doctor / Specialist Name
                </label>
                <input
                  id="apptDoctor"
                  type="text"
                  required
                  placeholder="e.g. Dr. Patel (Cardiology)"
                  value={apptDoctor}
                  onChange={(e) => setApptDoctor(e.target.value)}
                  className="w-full min-h-[50px] px-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-lg"
                />
              </div>

              <div>
                <label htmlFor="apptPlace" className="block text-base font-bold mb-1">
                  Clinic / Hospital Location
                </label>
                <input
                  id="apptPlace"
                  type="text"
                  required
                  placeholder="e.g. City Care Hospital, 3rd Floor"
                  value={apptPlace}
                  onChange={(e) => setApptPlace(e.target.value)}
                  className="w-full min-h-[50px] px-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-lg"
                />
              </div>

              <div>
                <label htmlFor="apptDateTime" className="block text-base font-bold mb-1">
                  Date and Time
                </label>
                <input
                  id="apptDateTime"
                  type="datetime-local"
                  required
                  value={apptDateTime}
                  onChange={(e) => setApptDateTime(e.target.value)}
                  className="w-full min-h-[50px] px-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-lg"
                />
              </div>

              <div>
                <label htmlFor="apptNotes" className="block text-base font-bold mb-1">
                  Special Notes / Preparation
                </label>
                <input
                  id="apptNotes"
                  type="text"
                  placeholder="e.g. Fasting required for blood work"
                  value={apptNotes}
                  onChange={(e) => setApptNotes(e.target.value)}
                  className="w-full min-h-[50px] px-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-lg"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submittingAppt}
              className="min-h-[50px] px-6 text-lg font-bold rounded-xl bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50"
            >
              {submittingAppt ? 'Submitting...' : 'Submit Appointment Proposal'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
