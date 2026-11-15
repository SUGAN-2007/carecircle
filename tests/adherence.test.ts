import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateAdherence } from '@/lib/adherence';
import * as medicationsModule from '@/lib/medications';
import * as firebaseModule from '@/lib/firebase';

describe('Adherence Calculation Engine', () => {
  const profileId = 'prof-adh-1';
  const timezone = 'Asia/Kolkata';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 100% adherence when there is no medication history or total due is 0', async () => {
    vi.spyOn(medicationsModule, 'getActiveMedications').mockResolvedValue([]);

    const mockDb: any = {
      collection: () => ({
        where: () => ({
          get: async () => ({ docs: [] }),
        }),
      }),
    };
    vi.spyOn(firebaseModule, 'getFirestore').mockReturnValue(mockDb);

    const stats = await calculateAdherence(profileId, 7, timezone);
    expect(stats.rate).toBe(100);
    expect(stats.totalDue).toBe(0);
    expect(stats.taken).toBe(0);
    expect(stats.missed).toBe(0);
  });

  it('excludes future doses from the adherence denominator', async () => {
    // Current time: 2026-11-15 10:00:00 in Asia/Kolkata
    // Medication scheduled at 08:00 (past/due) and 20:00 (future/not due yet)
    const fixedNow = new Date('2026-11-15T04:30:00.000Z'); // 10:00 AM IST

    const mockMed: medicationsModule.Medication = {
      id: 'med-1',
      profileId,
      name: 'Metformin',
      dose: '500mg',
      scheduleTimes: ['08:00', '20:00'],
      withFood: true,
      startDate: '2026-11-15',
      endDate: null,
      pillCount: 20,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.spyOn(medicationsModule, 'getActiveMedications').mockResolvedValue([mockMed]);

    // Dose at 08:00 was taken
    const mockLogs = [
      {
        id: 'med-1_202611150800',
        data: () => ({
          id: 'med-1_202611150800',
          profileId,
          medicationId: 'med-1',
          status: 'taken',
          scheduledSlot: '2026-11-15 08:00',
        }),
      },
    ];

    const mockDb: any = {
      collection: () => ({
        where: () => ({
          get: async () => ({ docs: mockLogs }),
        }),
      }),
    };
    vi.spyOn(firebaseModule, 'getFirestore').mockReturnValue(mockDb);

    const stats = await calculateAdherence(profileId, 7, timezone, fixedNow);

    // Only the 08:00 dose is counted (20:00 is in the future)
    expect(stats.totalDue).toBe(1);
    expect(stats.taken).toBe(1);
    expect(stats.missed).toBe(0);
    expect(stats.rate).toBe(100);
  });

  it('marks past scheduled doses without logs as missed', async () => {
    const fixedNow = new Date('2026-11-15T08:00:00.000Z'); // 13:30 IST

    const mockMed: medicationsModule.Medication = {
      id: 'med-1',
      profileId,
      name: 'Aspirin',
      dose: '75mg',
      scheduleTimes: ['08:00'],
      withFood: true,
      startDate: '2026-11-14',
      endDate: null,
      pillCount: 10,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.spyOn(medicationsModule, 'getActiveMedications').mockResolvedValue([mockMed]);

    // Only 2026-11-14 08:00 was logged as taken; 2026-11-15 08:00 was missed
    const mockLogs = [
      {
        id: 'med-1_202611140800',
        data: () => ({
          id: 'med-1_202611140800',
          profileId,
          medicationId: 'med-1',
          status: 'taken',
          scheduledSlot: '2026-11-14 08:00',
        }),
      },
    ];

    const mockDb: any = {
      collection: () => ({
        where: () => ({
          get: async () => ({ docs: mockLogs }),
        }),
      }),
    };
    vi.spyOn(firebaseModule, 'getFirestore').mockReturnValue(mockDb);

    const stats = await calculateAdherence(profileId, 7, timezone, fixedNow);

    // 2 days were due: 1 taken, 1 unlogged (missed)
    expect(stats.totalDue).toBe(2);
    expect(stats.taken).toBe(1);
    expect(stats.missed).toBe(1);
    expect(stats.rate).toBe(50); // 1 / 2 = 50%
  });

  it('respects medication startDate and endDate boundaries', async () => {
    const fixedNow = new Date('2026-11-15T12:00:00.000Z');

    const boundedMed: medicationsModule.Medication = {
      id: 'med-bounded',
      profileId,
      name: 'Antibiotic',
      dose: '250mg',
      scheduleTimes: ['09:00'],
      withFood: false,
      startDate: '2026-11-13',
      endDate: '2026-11-14', // Ended yesterday
      pillCount: 2,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.spyOn(medicationsModule, 'getActiveMedications').mockResolvedValue([boundedMed]);

    const mockDb: any = {
      collection: () => ({
        where: () => ({
          get: async () => ({ docs: [] }), // No logs -> all due are missed
        }),
      }),
    };
    vi.spyOn(firebaseModule, 'getFirestore').mockReturnValue(mockDb);

    const stats = await calculateAdherence(profileId, 7, timezone, fixedNow);

    // Only 2026-11-13 and 2026-11-14 fall within [startDate, endDate]
    // 2026-11-15 is after endDate, so it is not counted.
    expect(stats.totalDue).toBe(2);
    expect(stats.missed).toBe(2);
    expect(stats.rate).toBe(0);
  });
});
