import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateDigestNarrative,
  processWeeklyDigestForProfile,
  buildWeeklyDigestEmail,
} from '@/lib/weeklyDigest';
import { GoogleGenAI } from '@google/genai';
import * as adherenceModule from '@/lib/adherence';
import * as emailModule from '@/lib/email';

vi.mock('@google/genai');
vi.mock('@/lib/firebase', () => ({
  getFirestore: vi.fn(),
}));

describe('Weekly Family Digest System', () => {
  const profileId = 'prof-digest-1';
  const profile = {
    name: 'George Miller',
    timezone: 'Asia/Kolkata',
    emailFamily: 'family@example.com',
    emailCaretaker: 'caretaker@example.com',
  };

  const sampleStats = {
    days: 7 as const,
    rate: 90,
    taken: 18,
    skipped: 1,
    missed: 1,
    totalDue: 20,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates warm narrative when Gemini succeeds', async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      text:
        'George did fantastic this week, taking 18 of 20 doses with a 90% adherence rate!',
    });

    (GoogleGenAI as any).mockImplementation(function (this: any) {
      return {
        models: { generateContent: mockGenerateContent },
      };
    });

    const narrative = await generateDigestNarrative({
      elderName: 'George',
      stats: sampleStats,
    });

    expect(narrative).toContain('George did fantastic this week');
    expect(narrative).toContain('90% adherence');
  });

  it('falls back to deterministic template when Gemini fails or times out', async () => {
    const mockGenerateContent = vi.fn().mockRejectedValue(new Error('API quota exceeded'));

    (GoogleGenAI as any).mockImplementation(function (this: any) {
      return {
        models: { generateContent: mockGenerateContent },
      };
    });

    const narrative = await generateDigestNarrative({
      elderName: 'George',
      stats: sampleStats,
    });

    expect(narrative).toContain('George achieved a 90% adherence rate');
    expect(narrative).toContain('18 out of 20');
  });

  it('builds an email with exact pre-computed numbers and escaped HTML', () => {
    const email = buildWeeklyDigestEmail({
      elderName: '<Script>George</Script>',
      stats: sampleStats,
      narrative: 'George had an amazing week.',
      weekLabel: '2026-W46',
    });

    expect(email.subject).toContain('90% Adherence');
    expect(email.html).toContain('&lt;Script&gt;George&lt;/Script&gt;');
    expect(email.html).toContain('90%');
    expect(email.html).toContain('18 Taken');
    expect(email.text).toContain('Taken: 18 | Missed: 1 | Skipped: 1');
  });

  it('enforces once-per-week execution using deterministic weeklyDigestLog ID', async () => {
    const { getFirestore } = await import('@/lib/firebase');

    vi.spyOn(adherenceModule, 'calculateAdherence').mockResolvedValue(sampleStats);
    const sendEmailSpy = vi.spyOn(emailModule, 'sendEmail').mockResolvedValue(true);

    let docStatus = 'none';
    const mockUpdate = vi.fn().mockImplementation((data) => {
      docStatus = data.status;
    });

    const mockTx = {
      get: vi.fn().mockImplementation(() =>
        Promise.resolve({
          exists: docStatus === 'sent',
          data: () => ({ status: docStatus }),
        }),
      ),
      set: vi.fn().mockImplementation(() => {
        docStatus = 'sending';
      }),
    };

    (getFirestore as any).mockReturnValue({
      collection: () => ({
        doc: () => ({
          update: mockUpdate,
        }),
        add: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      }),
      runTransaction: vi.fn().mockImplementation((cb) => cb(mockTx)),
    });

    // Run 1: Sends successfully
    const result1 = await processWeeklyDigestForProfile(
      profileId,
      profile,
      new Date('2026-11-15T18:30:00+05:30'),
      true, // force = true
    );

    expect(result1.sent).toBe(true);
    expect(sendEmailSpy).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent' }),
    );

    // Run 2: Immediately re-attempt in the same week -> must be skipped
    docStatus = 'sent';
    const result2 = await processWeeklyDigestForProfile(
      profileId,
      profile,
      new Date('2026-11-15T18:35:00+05:30'),
      true,
    );

    expect(result2.sent).toBe(false);
    expect(result2.reason).toMatch(/already sent for this week/i);
  });
});
