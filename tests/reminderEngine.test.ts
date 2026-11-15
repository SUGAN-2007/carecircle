import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runReminderTick, markOverdueMissedDoses } from '@/lib/reminderEngine';
import * as firebaseModule from '@/lib/firebase';
import * as emailModule from '@/lib/email';
import * as auditModule from '@/lib/auditLog';
import type { Medication } from '@/lib/medications';

describe('Reminder Engine & Cron Dispatcher', () => {
  const profileId = 'prof-rem-1';
  const timezone = 'Asia/Kolkata';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditModule, 'appendAuditLog').mockResolvedValue();
  });

  it('marks overdue doses (>30m past) as missed without overwriting existing Taken logs', async () => {
    // Current time: 10:00 AM IST
    const now = new Date('2026-11-15T04:30:00.000Z');

    const medications: Medication[] = [
      {
        id: 'med-1',
        profileId,
        name: 'Metformin',
        dose: '500mg',
        scheduleTimes: ['08:00', '09:00'], // 08:00 is >30m ago; 09:00 is >30m ago
        withFood: true,
        startDate: '2026-11-15',
        endDate: null,
        pillCount: 20,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Simulate 08:00 was ALREADY taken, but 09:00 is unlogged
    const doseStore = new Map<string, any>();
    doseStore.set('med-1_202611150800', {
      id: 'med-1_202611150800',
      status: 'taken',
    });

    const mockDb: any = {
      collection: () => ({
        doc: (id: string) => ({ id }),
      }),
      runTransaction: async (fn: (tx: any) => Promise<any>) => {
        const tx = {
          get: async (ref: any) => ({
            exists: doseStore.has(ref.id),
            data: () => doseStore.get(ref.id),
          }),
          set: (ref: any, data: any) => {
            doseStore.set(ref.id, data);
          },
        };
        return fn(tx);
      },
    };

    vi.spyOn(firebaseModule, 'getFirestore').mockReturnValue(mockDb);

    const count = await markOverdueMissedDoses(profileId, medications, timezone, now);

    // Only 09:00 should be newly marked as missed (08:00 was already taken)
    expect(count).toBe(1);

    // Verify 08:00 remains 'taken' (never overwritten)
    expect(doseStore.get('med-1_202611150800').status).toBe('taken');

    // Verify 09:00 is marked 'missed'
    expect(doseStore.get('med-1_202611150900').status).toBe('missed');
  });

  it('guarantees idempotency so overlapping ticks do not send duplicate emails', async () => {
    // Current time: 07:50 AM IST (10 mins before 08:00 dose)
    const now = new Date('2026-11-15T02:20:00.000Z');

    const reminderLogs = new Map<string, any>();
    const emailSpy = vi.spyOn(emailModule, 'sendEmail').mockResolvedValue(true);

    const mockDb: any = {
      collection: (colName: string) => {
        if (colName === 'profiles') {
          return {
            limit: () => ({
              get: async () => ({
                docs: [
                  {
                    id: profileId,
                    data: () => ({
                      name: 'Elder Margaret',
                      emailElder: 'elder@example.com',
                      timezone,
                    }),
                  },
                ],
              }),
            }),
          };
        }
        if (colName === 'medications') {
          return {
            where: () => ({
              where: () => ({
                get: async () => ({
                  docs: [
                    {
                      data: () => ({
                        id: 'med-1',
                        name: 'Metformin',
                        dose: '500mg',
                        scheduleTimes: ['08:00'],
                        startDate: '2026-11-15',
                        active: true,
                      }),
                    },
                  ],
                }),
              }),
            }),
          };
        }
        if (colName === 'appointments') {
          return {
            where: () => ({
              get: async () => ({ docs: [] }),
            }),
          };
        }
        if (colName === 'doseLog') {
          return {
            doc: () => ({
              get: async () => ({ exists: false, data: () => undefined }),
            }),
          };
        }
        if (colName === 'reminderLog') {
          return {
            doc: (docId: string) => ({
              id: docId,
              update: async (data: any) => {
                const current = reminderLogs.get(docId) || {};
                reminderLogs.set(docId, { ...current, ...data });
              },
            }),
          };
        }
        return {
          doc: () => ({ get: async () => ({ exists: false }) }),
        };
      },
      runTransaction: async (fn: (tx: any) => Promise<any>) => {
        const tx = {
          get: async (ref: any) => ({
            exists: reminderLogs.has(ref.id),
            data: () => reminderLogs.get(ref.id),
          }),
          set: (ref: any, data: any) => {
            reminderLogs.set(ref.id, data);
          },
          update: (ref: any, data: any) => {
            const current = reminderLogs.get(ref.id) || {};
            reminderLogs.set(ref.id, { ...current, ...data });
          },
        };
        return fn(tx);
      },
    };

    vi.spyOn(firebaseModule, 'getFirestore').mockReturnValue(mockDb);

    // 1st tick: sends email
    const res1 = await runReminderTick(now);
    expect(res1.sent).toBe(1);
    expect(emailSpy).toHaveBeenCalledTimes(1);

    // 2nd simultaneous/overlapping tick: detects in-flight or sent lock, skips sending
    const res2 = await runReminderTick(now);
    expect(res2.sent).toBe(0);
    // Email count must remain 1!
    expect(emailSpy).toHaveBeenCalledTimes(1);
  });

  it('retries up to 3 times on SMTP failure and permanently marks failed with audit log', async () => {
    const now = new Date('2026-11-15T02:20:00.000Z');
    const reminderLogs = new Map<string, any>();

    // Mock sendEmail to throw error
    vi.spyOn(emailModule, 'sendEmail').mockRejectedValue(new Error('SMTP Connection timeout'));
    const auditSpy = vi.spyOn(auditModule, 'appendAuditLog');

    const mockDb: any = {
      collection: (colName: string) => {
        if (colName === 'profiles') {
          return {
            limit: () => ({
              get: async () => ({
                docs: [
                  {
                    id: profileId,
                    data: () => ({
                      name: 'Elder Margaret',
                      emailElder: 'elder@example.com',
                      timezone,
                    }),
                  },
                ],
              }),
            }),
          };
        }
        if (colName === 'medications') {
          return {
            where: () => ({
              where: () => ({
                get: async () => ({
                  docs: [
                    {
                      data: () => ({
                        id: 'med-retry',
                        name: 'Aspirin',
                        dose: '75mg',
                        scheduleTimes: ['08:00'],
                        startDate: '2026-11-15',
                        active: true,
                      }),
                    },
                  ],
                }),
              }),
            }),
          };
        }
        if (colName === 'appointments') {
          return {
            where: () => ({
              get: async () => ({ docs: [] }),
            }),
          };
        }
        if (colName === 'doseLog') {
          return {
            doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }),
          };
        }
        if (colName === 'reminderLog') {
          return {
            doc: (docId: string) => ({
              id: docId,
              update: async (data: any) => {
                const cur = reminderLogs.get(docId) || {};
                reminderLogs.set(docId, { ...cur, ...data });
              },
            }),
          };
        }
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
      runTransaction: async (fn: (tx: any) => Promise<any>) => {
        const tx = {
          get: async (ref: any) => ({
            exists: reminderLogs.has(ref.id),
            data: () => reminderLogs.get(ref.id),
          }),
          set: (ref: any, data: any) => reminderLogs.set(ref.id, data),
          update: (ref: any, data: any) => {
            const cur = reminderLogs.get(ref.id) || {};
            reminderLogs.set(ref.id, { ...cur, ...data });
          },
        };
        return fn(tx);
      },
    };

    vi.spyOn(firebaseModule, 'getFirestore').mockReturnValue(mockDb);

    // Attempt 1: fails
    const res1 = await runReminderTick(now);
    expect(res1.failed).toBe(1);
    const lock1 = reminderLogs.get('med-retry_202611150800_upcoming_15m');
    expect(lock1.status).toBe('failed');
    expect(lock1.attempts).toBe(1);

    // Attempt 2: retries and fails
    const res2 = await runReminderTick(now);
    expect(res2.failed).toBe(1);
    const lock2 = reminderLogs.get('med-retry_202611150800_upcoming_15m');
    expect(lock2.status).toBe('failed');
    expect(lock2.attempts).toBe(2);

    // Attempt 3: fails and reaches permanent failure threshold
    const res3 = await runReminderTick(now);
    expect(res3.failed).toBe(1);
    const lock3 = reminderLogs.get('med-retry_202611150800_upcoming_15m');
    expect(lock3.status).toBe('permanently_failed');
    expect(lock3.attempts).toBe(3);

    // Verify audit log recorded on permanent failure
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reminder_permanently_failed',
      }),
    );
  });

  it('skips inactive medications, out-of-range dates, and profiles without email', async () => {
    const now = new Date('2026-11-15T02:20:00.000Z'); // 07:50 AM IST
    const sendEmailSpy = vi.spyOn(emailModule, 'sendEmail').mockResolvedValue(true);

    const mockDb: any = {
      collection: (colName: string) => {
        if (colName === 'profiles') {
          return {
            limit: () => ({
              get: async () => ({
                docs: [
                  // Profile 1: No email
                  {
                    id: 'prof-no-email',
                    data: () => ({ name: 'No Email User', emailElder: '' }),
                  },
                  // Profile 2: Valid email, but inactive / out of date medications
                  {
                    id: 'prof-inactive-meds',
                    data: () => ({
                      name: 'User Inactive',
                      emailElder: 'elder2@example.com',
                      timezone,
                    }),
                  },
                ],
              }),
            }),
          };
        }
        if (colName === 'medications') {
          return {
            where: () => ({
              where: () => ({
                get: async () => ({
                  docs: [
                    // Inactive
                    {
                      data: () => ({
                        id: 'm-inactive',
                        name: 'Inactive Med',
                        dose: '10mg',
                        active: false,
                        scheduleTimes: ['08:00'],
                        startDate: '2026-11-01',
                      }),
                    },
                    // Future start date
                    {
                      data: () => ({
                        id: 'm-future',
                        name: 'Future Med',
                        dose: '10mg',
                        active: true,
                        scheduleTimes: ['08:00'],
                        startDate: '2026-12-01',
                      }),
                    },
                    // Expired end date
                    {
                      data: () => ({
                        id: 'm-past',
                        name: 'Past Med',
                        dose: '10mg',
                        active: true,
                        scheduleTimes: ['08:00'],
                        startDate: '2026-10-01',
                        endDate: '2026-11-01',
                      }),
                    },
                  ],
                }),
              }),
            }),
          };
        }
        if (colName === 'appointments') {
          return { where: () => ({ get: async () => ({ docs: [] }) }) };
        }
        if (colName === 'doseLog') {
          return { doc: () => ({ get: async () => ({ exists: false }) }) };
        }
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
      runTransaction: async (fn: any) =>
        fn({
          get: async () => ({ exists: false }),
          set: () => {},
          update: () => {},
        }),
    };

    vi.spyOn(firebaseModule, 'getFirestore').mockReturnValue(mockDb);

    const result = await runReminderTick(now);
    expect(result.sent).toBe(0);
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it('sends appointment reminders 24 hours and 2 hours in advance', async () => {
    // Current time: 2026-11-15 08:00 IST
    const now = new Date('2026-11-15T02:30:00.000Z');
    const sendEmailSpy = vi.spyOn(emailModule, 'sendEmail').mockResolvedValue(true);

    const reminderDocs = new Map<string, any>();

    const mockDb: any = {
      collection: (colName: string) => {
        if (colName === 'profiles') {
          return {
            limit: () => ({
              get: async () => ({
                docs: [
                  {
                    id: profileId,
                    data: () => ({
                      name: 'Elder Margaret',
                      emailElder: 'margaret@example.com',
                      timezone,
                    }),
                  },
                ],
              }),
            }),
          };
        }
        if (colName === 'medications') {
          return { where: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }) };
        }
        if (colName === 'appointments') {
          return {
            where: () => ({
              get: async () => ({
                docs: [
                  // Appt 1: Exactly ~2 hours from now
                  {
                    data: () => ({
                      id: 'appt-2h',
                      doctor: 'Dr. House',
                      place: 'Room 101',
                      dateTime: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
                      reminderSent: { dayBefore: false, twoHoursBefore: false },
                    }),
                  },
                  // Appt 2: Exactly ~24 hours from now
                  {
                    data: () => ({
                      id: 'appt-24h',
                      doctor: 'Dr. Strange',
                      place: 'Sanctum',
                      dateTime: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
                      reminderSent: { dayBefore: false, twoHoursBefore: false },
                    }),
                  },
                ],
              }),
            }),
          };
        }
        if (colName === 'reminderLog') {
          return {
            doc: (id: string) => ({
              id,
              update: async (data: any) => reminderDocs.set(id, data),
            }),
          };
        }
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
      runTransaction: async (fn: any) =>
        fn({
          get: async (ref: any) => ({
            exists: reminderDocs.has(ref.id),
            data: () => reminderDocs.get(ref.id),
          }),
          set: (ref: any, data: any) => reminderDocs.set(ref.id, data),
          update: (ref: any, data: any) => reminderDocs.set(ref.id, data),
        }),
    };

    vi.spyOn(firebaseModule, 'getFirestore').mockReturnValue(mockDb);

    const result = await runReminderTick(now);
    expect(result.sent).toBe(2);
    expect(sendEmailSpy).toHaveBeenCalledTimes(2);
  });
});
