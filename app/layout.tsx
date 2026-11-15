import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'CareCircle',
    template: '%s | CareCircle',
  },
  description:
    'Smart medication management for elderly patients, caretakers and family.',
  robots: { index: false, follow: false }, // private health app
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /*
     * lang="en" is required for screen readers (WCAG 3.1.1).
     * The `dark` class is toggled by the client-side theme toggle in Phase 3.
     */
    <html lang="en">
      <body className="bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 antialiased">
        {/* Skip-navigation link — first focusable element for keyboard users */}
        <a href="#main-content" className="skip-nav">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
