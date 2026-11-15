import type { Metadata } from 'next';
import { Atkinson_Hyperlegible } from 'next/font/google';
import './globals.css';

const atkinson = Atkinson_Hyperlegible({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-atkinson',
});

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
    <html lang="en">
      <body className={`${atkinson.variable} ${atkinson.className} bg-[#F0F9FF] dark:bg-[#0B132B] text-slate-900 dark:text-slate-100 antialiased`}>
        {/* Skip-navigation link — first focusable element for keyboard users */}
        <a href="#main-content" className="skip-nav">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
