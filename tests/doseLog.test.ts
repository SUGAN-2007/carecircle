import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logDose, getDoseDocId, getTodayDoses } from '@/lib/doseLog';
import * as firebaseModule from '@/lib/firebase';
import * as medicationsModule from '@/lib/medications';
import * as auditModule from '@/lib/auditLog';

describe('Dose Logging Engine & Idempotency', () => {
  const profileId = 'prof-dose-1';
  const medicationId = 'med-101';
  const timezone = 'Asia/Kolkata';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditModule, 'appendAuditLog').mockResolvedValue();
    const defaultMockDb: any = {
      collection: () => ({
        doc: (id: string) => ({ id }),
      }),
      runTransaction: async (fn: any) => fn({ get: vi.fn(), set: vi.fn(), update: vi.fn() }),
    };
    vi.spyOn(firebaseModule, 'getFirestore').mockReturnValue(defaultMockDb);
  });

  it('rejects logging a dose that is more than 2 hours in the future', async () => {
    // Current time: 10:00 AM IST
    const now = new Date('2026-11-15T04:30:00.000Z');
    // Scheduled slot at 13:00 IST (3 hours in the future)
    const futureSlot = '2026-11-15 13:00';

    const result = await logDose({
      profileId,
      medicationId,
      scheduledSlot: futureSlot,
      timezone,
      status: 'taken',
      loggedBy: 'elder',
      loggedByRole: 'elder',
      now,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/more than 2 hours/i);
  });

  it('atomically decrements pillCount on Taken, floored at 0', async () => {
    const now = new Date('2026-11-15T04:30:00.000Z'); // 10:00 AM IST
    const validSlot = '2026-11-15 09:30';

    let storedPillCount = 1;
    let storedDoseLog: any = null;

    const mockDb: any = {
      collection: () => ({
        doc: (id: string) => ({ id }),
      }),
      runTransaction: async (fn: (tx: any) => Promise<any>) => {
        const tx = {
          get: async (ref: any) => {
            if (ref.id === medicationId) {
              return {
                exists: true,
                data: () => ({
                  id: medicationId,
                  profileId,
                  name: 'Metformin',
                  pillCount: storedPillCount,
                }),
              };
            }
            // Dose ref
            return {
              exists: storedDoseLog !== null,
              data: () => storedDoseLog,
            };
          },
          update: (ref: any, data: any) => {
            if (ref.id === medicationId && data.pillCount !== undefined) {
              storedPillCount = data.pillCount;
            }
          },
          set: (ref: any, data: any) => {
            storedDoseLog = data;
          },
        };
        return fn(tx);
      },
    };

    vi.spyOn(firebaseModule, 'getFirestore').mockReturnValue(mockDb);

    // First take: pillCount 1 -> 0
    const res1 = await logDose({
      profileId,
      medicationId,
      scheduledSlot: validSlot,
      timezone,
      status: 'taken',
      loggedBy: 'elder',
      loggedByRole: 'elder',
      now,
    });

    expect(res1.success).toBe(true);
    expect(res1.pillCountRemaining).toBe(0);
    expect(storedPillCount).toBe(0);

    // Second slot when pillCount is already 0: should floor at 0 (never negative)
    const slot2 = '2026-11-15 10:00';
    storedDoseLog = null; // New slot

    const res2 = await logDose({
      profileId,
      medicationId,
      scheduledSlot: slot2,
      timezone,
      status: 'taken',
      loggedBy: 'elder',
      loggedByRole: 'elder',
      now,
    });

    expect(res2.success).toBe(true);
    expect(res2.pillCountRemaining).toBe(0);
    expect(storedPillCount).toBe(0);
  });

  it('prevents double-tap duplicates using deterministic doc IDs (idempotency)', async () => {
    const now = new Date('2026-11-15T04:30:00.000Z');
    const slot = '2026-11-15 09:00';
    const docId = getDoseDocId(medicationId, slot);

    let doseExists = false;
    let storedDose: any = null;

    const mockDb: any = {
      collection: () => ({
        doc: (id: string) => ({ id }),
      }),
      runTransaction: async (fn: (tx: any) => Promise<any>) => {
        const tx = {
          get: async (ref: any) => {
            if (ref.id === medicationId) {
              return {
                exists: true,
                data: () => ({
                  id: medicationId,
                  profileId,
                  name: 'Metformin',
                  pillCount: 20,
                }),
              };
            }
            return {
              exists: doseExists,
              data: () => storedDose,
            };
          },
          update: vi.fn(),
          set: (ref: any, data: any) => {
            doseExists = true;
            storedDose = data;
          },
        };
        return fn(tx);
      },
    };

    vi.spyOn(firebaseModule, 'getFirestore').mockReturnValue(mockDb);

    // Tap 1: writes dose log
    const tap1 = await logDose({
      profileId,
      medicationId,
      scheduledSlot: slot,
      timezone,
      status: 'taken',
      loggedBy: 'elder',
      loggedByRole: 'elder',
      now,
    });
    expect(tap1.success).toBe(true);
    expect(tap1.alreadyLogged).toBe(false);

    // Tap 2 (immediate double tap on same slot): detects existing deterministic doc
    const tap2 = await logDose({
      profileId,
      medicationId,
      scheduledSlot: slot,
      timezone,
      status: 'taken',
      loggedBy: 'elder',
      loggedByRole: 'elder',
      now,
    });
    expect(tap2.success).toBe(true);
    expect(tap2.alreadyLogged).toBe(true);
    expect(tap2.status).toBe('taken');
  });

  it('retrieves and formats today doses chronologically with status merged', async () => {
    const now = new Date('2026-11-15T04:30:00.000Z'); // 10:00 AM IST

    vi.spyOn(medicationsModule, 'getActiveMedications').mockResolvedValue([
      {
        id: 'med-1',
        profileId,
        name: 'Metformin',
        dose: '500mg',
        scheduleTimes: ['20:00', '08:00'],
        withFood: true,
        startDate: '2026-11-01',
        endDate: null,
        pillCount: 40,
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const mockDb: any = {
      collection: () => ({
        where: () => ({
          get: async () => ({
            docs: [
              {
                id: getDoseDocId('med-1', '2026-11-15 08:00'),
                data: () => ({
                  status: 'taken',
                  scheduledSlot: '2026-11-15 08:00',
                  loggedAt: now,
                }),
              },
            ],
          }),
        }),
      }),
    };

    vi.spyOn(firebaseModule, 'getFirestore').mockReturnValue(mockDb);

    const items = await getTodayDoses(profileId, timezone, now);
    expect(items).toHaveLength(2);
    // Chronological order: 08:00 first, 20:00 second
    expect(items[0].timeSlot).toBe('08:00');
    expect(items[0].status).toBe('taken');
    expect(items[1].timeSlot).toBe('20:00');
    expect(items[1].status).toBe('pending');
  });
});
