/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import axe from 'axe-core';

// Mock Next.js navigation hooks
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard',
}));

// Mock Link component
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Global fetch mock to provide clean default state
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      doses: [],
      medications: [],
      appointments: [],
      pendingChanges: [],
      adherence: { rate: 95, taken: 19, skipped: 1, missed: 0 },
      valid: true,
      action: 'taken',
      medicationName: 'Metformin',
    }),
  });
});

// Import client pages
import LoginPage from '@/app/login/page';
import SetupPage from '@/app/setup/page';
import ElderDashboard from '@/app/dashboard/elder/page';
import ApprovalsPage from '@/app/dashboard/elder/approvals/page';
import CaretakerDashboard from '@/app/dashboard/caretaker/page';
import FamilyDashboard from '@/app/dashboard/family/page';
import NaturalLanguageAdd from '@/app/dashboard/elder/nl-add/page';
import ActionConfirmationPage from '@/app/action/[token]/page';

describe('WCAG AA Automated Accessibility Audits (axe-core)', () => {
  async function auditAxe(container: HTMLElement) {
    const results = await axe.run(container, {
      rules: {
        // In isolated jsdom test containers, page-level <html> checks (like landmarks/page title) can be skipped
        'region': { enabled: false },
        'page-has-heading-one': { enabled: false },
      },
    });

    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    return seriousOrCritical;
  }

  it('verifies /login page has zero critical or serious a11y violations', async () => {
    const { container } = render(<LoginPage />);
    const violations = await auditAxe(container);
    expect(violations).toEqual([]);
  });

  it('verifies /setup page has zero critical or serious a11y violations', async () => {
    const { container } = render(<SetupPage />);
    const violations = await auditAxe(container);
    expect(violations).toEqual([]);
  });

  it('verifies Elder Today dashboard has zero critical or serious a11y violations', async () => {
    const { container } = render(<ElderDashboard />);
    const violations = await auditAxe(container);
    expect(violations).toEqual([]);
  });

  it('verifies Approvals page has zero critical or serious a11y violations', async () => {
    const { container } = render(<ApprovalsPage />);
    const violations = await auditAxe(container);
    expect(violations).toEqual([]);
  });

  it('verifies Caretaker dashboard has zero critical or serious a11y violations', async () => {
    const { container } = render(<CaretakerDashboard />);
    const violations = await auditAxe(container);
    expect(violations).toEqual([]);
  });

  it('verifies Family dashboard has zero critical or serious a11y violations', async () => {
    const { container } = render(<FamilyDashboard />);
    const violations = await auditAxe(container);
    expect(violations).toEqual([]);
  });

  it('verifies Natural Language Add page has zero critical or serious a11y violations', async () => {
    const { container } = render(<NaturalLanguageAdd />);
    const violations = await auditAxe(container);
    expect(violations).toEqual([]);
  });

  it('verifies /action/[token] confirmation page has zero critical or serious a11y violations', async () => {
    const { container } = render(
      <ActionConfirmationPage params={{ token: 'test-token' }} />,
    );
    const violations = await auditAxe(container);
    expect(violations).toEqual([]);
  });
});
