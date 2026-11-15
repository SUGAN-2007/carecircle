'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ParsedMedication } from '@/lib/geminiParse';

export default function NaturalLanguageAddMedication() {
  const router = useRouter();

  const [inputPrompt, setInputPrompt] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Review card state
  const [parsedMed, setParsedMed] = useState<ParsedMedication | null>(null);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [scheduleTimes, setScheduleTimes] = useState('');
  const [withFood, setWithFood] = useState(false);
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [pillCount, setPillCount] = useState('30');

  const handleParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim()) return;

    setParsing(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch('/api/gemini/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputPrompt }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not understand, please try again.');
      }

      const med: ParsedMedication = data.medication;
      setParsedMed(med);
      setName(med.name);
      setDose(med.dose);
      setScheduleTimes(med.scheduleTimes.join(', '));
      setWithFood(med.withFood);
      setStartDate(med.startDate);
      setPillCount(String(med.pillCount));
      setNotice('✨ AI successfully extracted your medication details. Please review below.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not understand, please try again.',
      );
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);

    const times = scheduleTimes
      .split(',')
      .map((t) => t.trim())
      .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));

    if (times.length === 0) {
      setError('Please provide at least one valid schedule time in HH:mm format.');
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          dose: dose.trim(),
          scheduleTimes: times,
          withFood,
          startDate,
          pillCount: parseInt(pillCount, 10) || 0,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save medication');
      }

      if (data.pending) {
        setNotice('✅ Proposed change submitted for Elder review.');
      } else {
        setNotice('🎉 Medication successfully added to your schedule!');
      }

      setParsedMed(null);
      setInputPrompt('');
      setTimeout(() => {
        router.push('/dashboard/elder');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving medication');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      id="main-content"
      className="min-h-screen p-4 sm:p-8 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
    >
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/elder"
            className="inline-flex items-center gap-2 text-lg font-bold text-blue-700 dark:text-blue-400 hover:underline min-h-[48px]"
          >
            ← Back to Dashboard
          </Link>
          <span className="text-base font-extrabold px-3 py-1 bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 rounded-full border border-purple-300">
            Powered by Google Gemini
          </span>
        </div>

        {/* Header */}
        <header className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            🎙️ Smart Medication Entry
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Type or paste your doctor&apos;s prescription notes in plain English.
            Gemini will format it into your schedule.
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

        {/* Input Form */}
        <form
          onSubmit={handleParse}
          className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
        >
          <label htmlFor="promptInput" className="block text-xl font-bold">
            Describe your medicine instructions:
          </label>
          <textarea
            id="promptInput"
            rows={4}
            maxLength={500}
            required
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder='e.g. "Take Lisinopril 10mg once every morning at 8am with breakfast, 30 tablets"'
            className="w-full p-4 text-xl rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus-visible:ring-4 focus-visible:ring-blue-600"
          />
          <div className="flex items-center justify-between text-base text-slate-500 font-bold">
            <span>{inputPrompt.length}/500 characters</span>
            <span>Example: &quot;Metformin 500mg twice a day with meals&quot;</span>
          </div>

          <button
            type="submit"
            disabled={parsing || !inputPrompt.trim()}
            className="w-full min-h-[56px] px-8 py-3 text-xl font-extrabold rounded-2xl bg-purple-700 hover:bg-purple-800 text-white shadow-md transition-all disabled:opacity-50 focus-visible:ring-4 focus-visible:ring-purple-600"
          >
            {parsing ? (
              'Gemini is reading your instructions...'
            ) : (
              <>
                <span aria-hidden="true">✨</span> Parse with Gemini AI
              </>
            )}
          </button>
        </form>

        {/* Editable Review Card */}
        {parsedMed && (
          <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border-3 border-blue-500 dark:border-blue-600 shadow-xl space-y-6">
            <div className="border-b-2 border-slate-200 dark:border-slate-800 pb-4">
              <h2 className="text-2xl font-black text-blue-700 dark:text-blue-400">
                📋 Please Review and Confirm
              </h2>
              <p className="text-base text-slate-600 dark:text-slate-400 mt-1">
                You are always in control. Make any corrections before saving.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="revName" className="block text-base font-bold mb-1">
                  Medication Name
                </label>
                <input
                  id="revName"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[50px] px-3 text-lg rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label htmlFor="revDose" className="block text-base font-bold mb-1">
                  Dose / Strength
                </label>
                <input
                  id="revDose"
                  type="text"
                  required
                  value={dose}
                  onChange={(e) => setDose(e.target.value)}
                  className="w-full min-h-[50px] px-3 text-lg rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label htmlFor="revTimes" className="block text-base font-bold mb-1">
                  Times (comma-separated HH:mm)
                </label>
                <input
                  id="revTimes"
                  type="text"
                  required
                  value={scheduleTimes}
                  onChange={(e) => setScheduleTimes(e.target.value)}
                  className="w-full min-h-[50px] px-3 text-lg rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label htmlFor="revPills" className="block text-base font-bold mb-1">
                  Pill Count in Bottle
                </label>
                <input
                  id="revPills"
                  type="number"
                  min="0"
                  required
                  value={pillCount}
                  onChange={(e) => setPillCount(e.target.value)}
                  className="w-full min-h-[50px] px-3 text-lg rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label htmlFor="revStart" className="block text-base font-bold mb-1">
                  Start Date
                </label>
                <input
                  id="revStart"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full min-h-[50px] px-3 text-lg rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center pt-6 gap-3">
                <input
                  id="revFood"
                  type="checkbox"
                  checked={withFood}
                  onChange={(e) => setWithFood(e.target.checked)}
                  className="w-6 h-6 rounded"
                />
                <label htmlFor="revFood" className="text-lg font-bold">
                  Take with food / meal
                </label>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 min-h-[56px] px-8 text-xl font-black rounded-2xl bg-green-700 hover:bg-green-800 text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50 focus-visible:ring-4 focus-visible:ring-green-600"
              >
                {saving ? (
                  'Saving...'
                ) : (
                  <>
                    <span aria-hidden="true">✔</span> Confirm & Save to Schedule
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setParsedMed(null)}
                className="min-h-[56px] px-6 text-lg font-bold rounded-2xl border-2 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
