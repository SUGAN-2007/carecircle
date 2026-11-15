import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runEscalationPassForProfile } from '@/lib/escalation';
import * as emailModule from '@/lib/email';
import * as reminderEngineModule from '@/lib/reminderEngine';
import type { Medication } from '@/lib/medications';

vi.mock('@/lib/firebase', () => ({
  getFirestore: vi.fn(),
}));

describe('Escalation Ladder System', () => {
  const profileId = 'prof-esc-1';
  const profile = {
    name: 'Eleanor Vance',
    timezone: 'Asia/Kolkata',
    emailElder: 'eleanor@example.com',
    emailCaretaker: 'caretaker@example.com',
    emailFamily: 'daughter@example.com',
    escalation: {
      enabled: true,
      elderMinutes: 30,
      caretakerMinutes: 60,
      familyMinutes: 120,
    },
  };

  const sampleMed: Medication = {
    id: 'med-bp',
    profileId,
    name: 'Amlodipine',
    dose: '5mg',
    scheduleTimes: ['08:00'],
    withFood: false,
    startDate: '2026-11-01',
    endDate: null,
    pillCount: 20,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends caretaker escalation when dose is overdue by >= caretakerMinutes', async () => {
    const { getFirestore } = await import('@/lib/firebase');

    // 08:00 dose evaluated at 09:15 (75 minutes overdue -> triggers caretaker (60m), but not family (120m))
    const now = new Date('2026-11-15T09:15:00+05:30');

    const sendEmailSpy = vi.spyOn(emailModule, 'sendEmail').mockResolvedValue(true);
    const lockSpy = vi
      .spyOn(reminderEngineModule, 'acquireReminderLock')
      .mockResolvedValue({ action: 'send', attempts: 1 });
    const finalizeSpy = vi
      .spyOn(reminderEngineModule, 'finalizeReminder')
      .mockResolvedValue(undefined);

    // Mock doseLog not yet logged (or missed)
    const mockDoseGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ status: 'missed' }),
    });

    (getFirestore as any).mockReturnValue({
      collection: (col: string) => ({
        doc: () => ({ get: mockDoseGet }),
        add: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      }),
    });

    const result = await runEscalationPassForProfile(
      profileId,
      profile,
      [sampleMed],
      now,
    );

    expect(result.caretakerEscalations).toBe(1);
    expect(result.familyEscalations).toBe(0);
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'caretaker@example.com' }),
    );
    expect(lockSpy).toHaveBeenCalledWith(
      expect.stringContaining('med-bp'),
      'escalate_caretaker',
      profileId,
      'caretaker@example.com',
    );
    expect(finalizeSpy).toHaveBeenCalledWith(
      expect.stringContaining('med-bp'),
      'escalate_caretaker',
      true,
      profileId,
    );
  });

  it('sends family escalation when dose is overdue by >= familyMinutes', async () => {
    const { getFirestore } = await import('@/lib/firebase');

    // 08:00 dose evaluated at 10:30 (150 minutes overdue -> triggers both tiers)
    const now = new Date('2026-11-15T10:30:00+05:30');

    const sendEmailSpy = vi.spyOn(emailModule, 'sendEmail').mockResolvedValue(true);
    vi.spyOn(reminderEngineModule, 'acquireReminderLock').mockResolvedValue({
      action: 'send',
      attempts: 1,
    });
    vi.spyOn(reminderEngineModule, 'finalizeReminder').mockResolvedValue(undefined);

    const mockDoseGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ status: 'missed' }),
    });

    (getFirestore as any).mockReturnValue({
      collection: () => ({
        doc: () => ({ get: mockDoseGet }),
        add: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      }),
    });

    const result = await runEscalationPassForProfile(
      profileId,
      profile,
      [sampleMed],
      now,
    );

    expect(result.caretakerEscalations).toBe(1);
    expect(result.familyEscalations).toBe(1);
    expect(sendEmailSpy).toHaveBeenCalledTimes(2);
    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'daughter@example.com' }),
    );
  });

  it('STOPS escalating if dose is already marked taken or skipped', async () => {
    const { getFirestore } = await import('@/lib/firebase');

    // 08:00 dose evaluated at 10:30 (150m overdue), BUT dose was marked taken!
    const now = new Date('2026-11-15T10:30:00+05:30');

    const sendEmailSpy = vi.spyOn(emailModule, 'sendEmail');

    // Dose IS taken
    const mockDoseGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ status: 'taken', loggedAt: new Date() }),
    });

    (getFirestore as any).mockReturnValue({
      collection: () => ({
        doc: () => ({ get: mockDoseGet }),
      }),
    });

    const result = await runEscalationPassForProfile(
      profileId,
      profile,
      [sampleMed],
      now,
    );

    expect(result.caretakerEscalations).toBe(0);
    expect(result.familyEscalations).toBe(0);
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it('does nothing when escalation is disabled for the profile', async () => {
    const disabledProfile = {
      ...profile,
      escalation: { ...profile.escalation, enabled: false },
    };

    const now = new Date('2026-11-15T11:00:00+05:30');
    const sendEmailSpy = vi.spyOn(emailModule, 'sendEmail');

    const result = await runEscalationPassForProfile(
      profileId,
      disabledProfile,
      [sampleMed],
      now,
    );

    expect(result.caretakerEscalations).toBe(0);
    expect(result.familyEscalations).toBe(0);
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });
});
