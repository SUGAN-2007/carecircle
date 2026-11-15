'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { EscalationConfig } from '@/lib/escalation';

export default function EscalationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [elderMinutes, setElderMinutes] = useState(30);
  const [caretakerMinutes, setCaretakerMinutes] = useState(60);
  const [familyMinutes, setFamilyMinutes] = useState(120);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/profiles/escalation');
        if (res.ok) {
          const data = await res.json();
          const esc: EscalationConfig = data.escalation;
          setEnabled(esc.enabled);
          setElderMinutes(esc.elderMinutes);
          setCaretakerMinutes(esc.caretakerMinutes);
          setFamilyMinutes(esc.familyMinutes);
        }
      } catch {
        setError('Failed to load current settings.');
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch('/api/profiles/escalation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          elderMinutes: Number(elderMinutes),
          caretakerMinutes: Number(caretakerMinutes),
          familyMinutes: Number(familyMinutes),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update settings');
      }

      setNotice('✅ Escalation settings saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      id="main-content"
      className="min-h-screen p-4 sm:p-8 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
    >
      <div className="max-w-2xl mx-auto space-y-8">
        <Link
          href="/dashboard/elder"
          className="inline-flex items-center gap-2 text-lg font-bold text-blue-700 dark:text-blue-400 hover:underline min-h-[48px]"
        >
          ← Back to Dashboard
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            🚨 Escalation Ladder Settings
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            If a scheduled medication dose is missed, CareCircle steps in to notify
            your care circle progressively.
          </p>
        </header>

        {notice && (
          <div
            role="status"
            className="p-5 rounded-2xl bg-green-100 dark:bg-green-950/80 border-2 border-green-600 text-green-950 dark:text-green-200 text-lg font-bold"
          >
            {notice}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-5 rounded-2xl bg-red-100 dark:bg-red-950/80 border-2 border-red-500 text-red-950 dark:text-red-200 text-lg font-bold"
          >
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <p className="text-lg text-slate-500 font-bold">Loading your settings...</p>
        ) : (
          <form
            onSubmit={handleSave}
            className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-md space-y-6"
          >
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-100 dark:bg-slate-800">
              <div>
                <span className="text-xl font-bold block">
                  Enable Escalation Ladder
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Send follow-up alerts if a dose remains unconfirmed
                </span>
              </div>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-8 h-8 rounded accent-blue-700 cursor-pointer"
                aria-label="Enable Escalation Ladder"
              />
            </div>

            {/* Tier 1: Elder missed dose */}
            <div className="space-y-2">
              <label htmlFor="elderMin" className="block text-lg font-bold">
                1. Elder Alert Delay (Minutes after scheduled time)
              </label>
              <input
                id="elderMin"
                type="number"
                min={5}
                max={180}
                required
                disabled={!enabled}
                value={elderMinutes}
                onChange={(e) => setElderMinutes(Number(e.target.value))}
                className="w-full min-h-[50px] px-4 text-xl rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-50"
              />
              <p className="text-sm text-slate-500">
                Default: 30 minutes. An urgent reminder email is sent directly to you.
              </p>
            </div>

            {/* Tier 2: Caretaker escalation */}
            <div className="space-y-2">
              <label htmlFor="caretakerMin" className="block text-lg font-bold">
                2. Caretaker Escalation Delay (Minutes after scheduled time)
              </label>
              <input
                id="caretakerMin"
                type="number"
                min={15}
                max={360}
                required
                disabled={!enabled}
                value={caretakerMinutes}
                onChange={(e) => setCaretakerMinutes(Number(e.target.value))}
                className="w-full min-h-[50px] px-4 text-xl rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-50"
              />
              <p className="text-sm text-slate-500">
                Default: 60 minutes. Your caretaker is alerted to check in.
              </p>
            </div>

            {/* Tier 3: Family escalation */}
            <div className="space-y-2">
              <label htmlFor="familyMin" className="block text-lg font-bold">
                3. Family Escalation Delay (Minutes after scheduled time)
              </label>
              <input
                id="familyMin"
                type="number"
                min={30}
                max={720}
                required
                disabled={!enabled}
                value={familyMinutes}
                onChange={(e) => setFamilyMinutes(Number(e.target.value))}
                className="w-full min-h-[50px] px-4 text-xl rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-50"
              />
              <p className="text-sm text-slate-500">
                Default: 120 minutes (2 hours). Your designated family member receives an alert.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-[56px] px-8 text-xl font-black rounded-2xl bg-blue-700 hover:bg-blue-800 text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50 focus-visible:ring-4 focus-visible:ring-blue-600"
            >
              {saving ? 'Saving Settings...' : 'Save Escalation Settings'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
