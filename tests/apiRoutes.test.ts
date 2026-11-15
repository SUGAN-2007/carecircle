import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { POST as logoutPost } from '@/app/api/auth/logout/route';
import { POST as rotatePost } from '@/app/api/auth/rotate/route';
import { GET as medGet, POST as medPost } from '@/app/api/medications/route';
import { PUT as medPut, DELETE as medDel } from '@/app/api/medications/[id]/route';
import { POST as doseLogPost } from '@/app/api/medications/[id]/log/route';
import { POST as cronTickPost, GET as cronTickGet } from '@/app/api/cron/tick/route';
import { GET as actionGet, POST as actionPost } from '@/app/api/action/[token]/route';
import { POST as profilePost } from '@/app/api/profiles/route';
import { GET as escGet, POST as escPost } from '@/app/api/profiles/escalation/route';
import * as authModule from '@/lib/auth';
import * as medicationsModule from '@/lib/medications';
import * as doseLogModule from '@/lib/doseLog';
import * as actionTokenModule from '@/lib/actionToken';
import * as reminderEngineModule from '@/lib/reminderEngine';
import * as hashModule from '@/lib/hash';

vi.mock('@/lib/firebase', () => ({
  getFirestore: vi.fn(),
}));

describe('API Route Handlers (Auth, Meds, Cron, Action, Profiles)', () => {
  const profileId = 'prof-api-1';

  beforeEach(async () => {
    vi.restoreAllMocks();
    const { getFirestore } = await import('@/lib/firebase');
    const mockDb: any = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false, data: () => ({ sessionVersion: 1 }) }),
          set: async () => undefined,
          update: async () => undefined,
        }),
        where: () => ({
          limit: () => ({
            get: async () => ({ empty: true, docs: [] }),
          }),
          get: async () => ({ empty: true, docs: [] }),
        }),
        add: async () => ({ id: 'new-id' }),
      }),
      runTransaction: async (fn: any) =>
        fn({
          get: async () => ({ exists: false }),
          set: async () => undefined,
          update: async () => undefined,
        }),
    };
    (getFirestore as any).mockReturnValue(mockDb);
  });

  describe('/api/auth/login', () => {
    it('returns 401 generic error for missing code or passcode (anti-enumeration)', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileCode: '' }),
      });
      const res = await loginPost(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid profile code or passcode/i);
    });

    it('returns generic error when profile is not found, executing dummy compare', async () => {
      const { getFirestore } = await import('@/lib/firebase');
      const compareSpy = vi.spyOn(hashModule, 'comparePasscode');

      (getFirestore as any).mockReturnValue({
        collection: (col: string) => {
          if (col === 'rateLimits') return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) };
          if (col === 'profiles') return { where: () => ({ limit: () => ({ get: () => Promise.resolve({ empty: true }) }) }) };
          return {
            doc: () => ({ get: () => Promise.resolve({ exists: false }) }),
            add: () => Promise.resolve({ id: 'audit-1' }),
          };
        },
        runTransaction: async (fn: any) =>
          fn({
            get: async () => ({ exists: false }),
            set: async () => undefined,
            update: async () => undefined,
          }),
      });

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileCode: 'CC-XXXX-YYYY', passcode: '123456' }),
      });

      const res = await loginPost(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid profile code or passcode/i);
      expect(compareSpy).toHaveBeenCalled();
    });
  });

  describe('/api/auth/logout', () => {
    it('clears session cookie on logout', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' });
      const res = await logoutPost(req);
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('Max-Age=0');
    });
  });

  describe('/api/auth/rotate', () => {
    it('allows Elder to rotate passcodes', async () => {
      vi.spyOn(authModule, 'requireRole').mockResolvedValue({
        success: true,
        session: { profileId, role: 'elder', sessionVersion: 1, timezone: 'Asia/Kolkata', name: 'Margaret' },
      });
      vi.spyOn(authModule, 'checkCsrfOrigin').mockReturnValue(true);

      const { getFirestore } = await import('@/lib/firebase');
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      (getFirestore as any).mockReturnValue({
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: true, data: () => ({ sessionVersion: 1 }) }),
            update: mockUpdate,
            set: mockUpdate,
          }),
          add: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/auth/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRole: 'caretaker', newPasscode: '654321' }),
      });

      const res = await rotatePost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('caretaker');
    });
  });

  describe('/api/medications', () => {
    it('GET returns active medications for profile', async () => {
      vi.spyOn(authModule, 'requireRole').mockResolvedValue({
        success: true,
        session: { profileId, role: 'family', sessionVersion: 1, timezone: 'Asia/Kolkata', name: 'John' },
      });
      vi.spyOn(medicationsModule, 'getActiveMedications').mockResolvedValue([
        {
          id: 'm1',
          profileId,
          name: 'Metformin',
          dose: '500mg',
          scheduleTimes: ['08:00'],
          withFood: true,
          startDate: '2026-11-01',
          endDate: null,
          pillCount: 30,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/medications');
      const res = await medGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.medications).toHaveLength(1);
    });

    it('POST with Caretaker role routes proposal to pending changes', async () => {
      vi.spyOn(authModule, 'requireRole').mockResolvedValue({
        success: true,
        session: { profileId, role: 'caretaker', sessionVersion: 1, timezone: 'Asia/Kolkata', name: 'Nurse Sarah' },
      });
      vi.spyOn(authModule, 'checkCsrfOrigin').mockReturnValue(true);

      const { getFirestore } = await import('@/lib/firebase');
      (getFirestore as any).mockReturnValue({
        collection: () => ({
          doc: () => ({ id: 'p-1', set: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue({ exists: false }) }),
          add: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Lisinopril',
          dose: '10mg',
          scheduleTimes: ['08:00'],
          withFood: false,
          startDate: '2026-11-15',
          pillCount: 30,
        }),
      });

      const res = await medPost(req);
      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.status).toBe('pending_approval');
      expect(data.pendingChangeId).toBeDefined();
    });
  });

  describe('/api/medications/[id]/log', () => {
    it('logs dose taken and returns remaining count', async () => {
      vi.spyOn(authModule, 'requireRole').mockResolvedValue({
        success: true,
        session: { profileId, role: 'elder', sessionVersion: 1, timezone: 'Asia/Kolkata', name: 'Margaret' },
      });
      vi.spyOn(authModule, 'checkCsrfOrigin').mockReturnValue(true);

      vi.spyOn(doseLogModule, 'logDose').mockResolvedValue({
        success: true,
        status: 'taken',
        alreadyLogged: false,
        pillCountRemaining: 29,
      });

      const req = new NextRequest('http://localhost:3000/api/medications/med-1/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledSlot: '2026-11-15 08:00', status: 'taken' }),
      });

      const res = await doseLogPost(req, { params: { id: 'med-1' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('taken');
      expect(data.pillCountRemaining).toBe(29);
    });
  });

  describe('/api/cron/tick', () => {
    it('executes reminder engine when valid secret is provided via POST or GET', async () => {
      vi.spyOn(reminderEngineModule, 'runReminderTick').mockResolvedValue({
        processed: 1,
        sent: 2,
        failed: 0,
        missed: 1,
      });

      const req = new NextRequest('http://localhost:3000/api/cron/tick', {
        method: 'POST',
        headers: { 'x-cron-secret': process.env.CRON_SECRET || 'test-cron-secret-min-16' },
      });

      const res = await cronTickPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sent).toBe(2);
      expect(data.missed).toBe(1);
    });
  });

  describe('/api/action/[token]', () => {
    it('GET verifies token and returns medication info without consuming', async () => {
      vi.spyOn(actionTokenModule, 'verifyActionToken').mockResolvedValue({
        valid: true,
        payload: {
          doseLogId: 'med1_202611150800',
          profileId,
          action: 'taken',
          jti: 'jti-test',
        },
      });

      const { getFirestore } = await import('@/lib/firebase');
      (getFirestore as any).mockReturnValue({
        collection: () => ({
          doc: () => ({ get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ name: 'Atorvastatin' }) }) }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/action/valid-token');
      const res = await actionGet(req, { params: { token: 'valid-token' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.action).toBe('taken');
      expect(data.medicationName).toBe('Atorvastatin');
    });

    it('POST executes action token', async () => {
      vi.spyOn(actionTokenModule, 'executeActionToken').mockResolvedValue({
        success: true,
        action: 'taken',
        message: 'Dose recorded as taken',
      });

      const req = new NextRequest('http://localhost:3000/api/action/valid-token', { method: 'POST' });
      const res = await actionPost(req, { params: { token: 'valid-token' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('/api/profiles/escalation', () => {
    it('GET returns current escalation settings for Elder', async () => {
      vi.spyOn(authModule, 'requireRole').mockResolvedValue({
        success: true,
        session: { profileId, role: 'elder', sessionVersion: 1, timezone: 'Asia/Kolkata', name: 'Margaret' },
      });

      const { getFirestore } = await import('@/lib/firebase');
      (getFirestore as any).mockReturnValue({
        collection: () => ({
          doc: () => ({
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                escalation: { enabled: true, elderMinutes: 30, caretakerMinutes: 60, familyMinutes: 120 },
              }),
            }),
          }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/profiles/escalation');
      const res = await escGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.escalation.caretakerMinutes).toBe(60);
    });

    it('POST updates escalation settings with validation', async () => {
      vi.spyOn(authModule, 'requireRole').mockResolvedValue({
        success: true,
        session: { profileId, role: 'elder', sessionVersion: 1, timezone: 'Asia/Kolkata', name: 'Margaret' },
      });

      const { getFirestore } = await import('@/lib/firebase');
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      (getFirestore as any).mockReturnValue({
        collection: () => ({
          doc: () => ({ update: mockUpdate }),
          add: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/profiles/escalation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          elderMinutes: 20,
          caretakerMinutes: 45,
          familyMinutes: 90,
        }),
      });

      const res = await escPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.escalation.elderMinutes).toBe(20);
    });
  });
});
