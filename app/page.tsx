/**
 * Landing / holding page for Phase 1.
 * Replaced by the role-based dashboard router in Phase 3.
 *
 * Accessibility:
 *  - Semantic <main> with id for skip-nav
 *  - Decorative emoji marked aria-hidden
 *  - Colour contrast ≥ 4.5:1 on both light and dark backgrounds
 *  - No time-limited content
 */
export default function HomePage() {
  return (
    <main
      id="main-content"
      className="min-h-screen flex flex-col items-center justify-center
                 bg-blue-50 dark:bg-gray-900 px-6 py-16"
    >
      <div className="max-w-2xl w-full text-center space-y-8">
        {/* Decorative — hidden from assistive tech */}
        <span aria-hidden="true" className="block text-7xl select-none">
          💊
        </span>

        <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
          CareCircle
        </h1>

        <p className="text-xl font-medium text-brand-700 dark:text-brand-100">
          Elderly Care &amp; Medication Management Platform
        </p>

        <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
          Helping elderly people manage daily medications, appointments and
          routines — while keeping family and caretakers informed and involved.
        </p>

        {/* Status badge */}
        <div
          role="status"
          aria-live="polite"
          className="inline-block rounded-xl bg-green-100 dark:bg-green-900/50
                     border border-green-300 dark:border-green-700
                     px-6 py-4"
        >
          <p className="text-green-800 dark:text-green-200 font-semibold text-lg">
            ✅&nbsp; Phase 1 — deployed successfully
          </p>
        </div>

        {/* Feature preview list */}
        <ul
          aria-label="Planned features"
          className="text-left space-y-3 text-gray-700 dark:text-gray-300
                     bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm"
        >
          {[
            '💊  Medication schedules with dose logging',
            '📅  Appointment reminders via email',
            '📊  7- and 30-day adherence tracking',
            '👨‍👩‍👧  Shared profile for Elder, Caretaker & Family',
            '🤖  Gemini AI — natural-language medication entry',
            '🔒  Secure passcode login with rate limiting',
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-lg">
              <span aria-hidden="true">{item.slice(0, 2)}</span>
              <span>{item.slice(3)}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
