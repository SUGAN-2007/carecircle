import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isChangeExpired,
  describeProposal,
  SEVEN_DAYS_MS,
  approvePendingChange,
  rejectPendingChange,
  cancelPendingChange,
} from '@/lib/pendingChanges';
import { GET } from '@/app/api/pending/route';
import { POST } from '@/app/api/pending/[id]/route';
import * as authModule from '@/lib/auth';
import * as pendingModule from '@/lib/pendingChanges';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/firebase', () => ({
  getFirestore: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

describe('Pending Changes & Elder Approval System', () => {
  const profileId = 'prof-elder-1';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Expiration & Summary Helpers', () => {
    it('detects changes older than 7 days as expired', () => {
      const freshDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      expect(isChangeExpired({ createdAt: freshDate })).toBe(false);

      const expiredDate = new Date(Date.now() - (SEVEN_DAYS_MS + 1000)); // 7 days + 1 sec
      expect(isChangeExpired({ createdAt: expiredDate })).toBe(true);
    });

    it('generates clear, human-readable descriptions', () => {
      const medDesc = describeProposal('medication_add', {
        name: 'Metformin',
        dose: '500mg',
        scheduleTimes: ['08:00', '20:00'],
      });
      expect(medDesc).toContain('Metformin');
      expect(medDesc).toContain('500mg');
      expect(medDesc).toContain('08:00 & 20:00');

      const apptDesc = describeProposal('appointment_add', {
        doctor: 'Dr. Smith',
        place: 'Clinic A',
      });
      expect(apptDesc).toContain('Dr. Smith');
      expect(apptDesc).toContain('Clinic A');
    });
  });

  describe('Approval Transaction & Tamper Re-Validation', () => {
    it('rejects approval if payload fails zod validation (tamper resistance)', async () => {
      const { getFirestore } = await import('@/lib/firebase');

      // Mock Firestore runTransaction
      const mockRunTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              id: 'pend-tampered-1',
              profileId,
              type: 'medication_add',
              // Invalid payload: scheduleTimes empty, pillCount negative
              payload: {
                name: 'Bad Pill',
                dose: '10mg',
                scheduleTimes: [],
                pillCount: -5,
              },
              status: 'pending',
              createdAt: new Date(),
            }),
          }),
          set: vi.fn(),
          update: vi.fn(),
        };
        return callback(mockTx);
      });

      const mockDb = {
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({ id: 'pend-tampered-1' }),
        }),
        runTransaction: mockRunTransaction,
      };

      (getFirestore as any).mockReturnValue(mockDb);

      await expect(
        approvePendingChange(profileId, 'pend-tampered-1', 'elder'),
      ).rejects.toThrow();
    });

    it('fails cleanly on double approval', async () => {
      const { getFirestore } = await import('@/lib/firebase');

      const mockRunTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              id: 'pend-already-done',
              profileId,
              type: 'medication_add',
              payload: { name: 'Pill' },
              status: 'approved', // already approved!
              createdAt: new Date(),
            }),
          }),
          set: vi.fn(),
          update: vi.fn(),
        };
        return callback(mockTx);
      });

      const mockDb = {
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({ id: 'pend-already-done' }),
        }),
        runTransaction: mockRunTransaction,
      };

      (getFirestore as any).mockReturnValue(mockDb);

      await expect(
        approvePendingChange(profileId, 'pend-already-done', 'elder'),
      ).rejects.toThrow(/Cannot approve proposal with status: approved/);
    });

    it('cannot approve an expired proposal (>7 days)', async () => {
      const { getFirestore } = await import('@/lib/firebase');

      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            id: 'pend-expired',
            profileId,
            type: 'medication_add',
            payload: { name: 'Pill' },
            status: 'pending',
            createdAt: new Date(Date.now() - (SEVEN_DAYS_MS + 5000)),
          }),
        }),
        set: vi.fn(),
        update: vi.fn(),
      };

      const mockDb = {
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({ id: 'pend-expired' }),
        }),
        runTransaction: vi.fn().mockImplementation((cb) => cb(mockTx)),
      };

      (getFirestore as any).mockReturnValue(mockDb);

      await expect(
        approvePendingChange(profileId, 'pend-expired', 'elder'),
      ).rejects.toThrow(/expired/i);

      expect(mockTx.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'expired' }),
      );
    });
  });

  describe('API Permissions & Origin Security', () => {
    it('forbids Family role from accessing pending changes (403)', async () => {
      vi.spyOn(authModule, 'requireRole').mockResolvedValue({
        success: false,
        response: NextResponse.json(
          { error: 'Forbidden: insufficient role permissions' },
          { status: 403 },
        ),
      });

      const req = new NextRequest('http://localhost:3000/api/pending');
      const res = await GET(req);

      expect(res.status).toBe(403);
    });

    it('allows Elder and Caretaker to fetch pending proposals', async () => {
      vi.spyOn(authModule, 'requireRole').mockResolvedValue({
        success: true,
        session: {
          profileId,
          role: 'caretaker',
          sessionVersion: 1,
          name: 'Caretaker Bob',
          timezone: 'Asia/Kolkata',
        },
      });

      vi.spyOn(pendingModule, 'getPendingChanges').mockResolvedValue([
        {
          id: 'pend-1',
          profileId,
          type: 'medication_add',
          payload: { name: 'Metformin', dose: '500mg' },
          proposedBy: 'caretaker',
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/pending');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.pendingChanges).toHaveLength(1);
      expect(data.pendingChanges[0].payload.name).toBe('Metformin');
    });

    it('forbids Caretaker from approving proposals (Elder only)', async () => {
      vi.spyOn(authModule, 'checkCsrfOrigin').mockReturnValue(true);
      vi.spyOn(authModule, 'requireRole').mockImplementation(async (allowedRoles) => {
        if (!allowedRoles.includes('caretaker')) {
          return {
            success: false,
            response: NextResponse.json(
              { error: 'Forbidden: Only the Elder can approve or reject' },
              { status: 403 },
            ),
          };
        }
        return {
          success: true,
          session: {
            profileId,
            role: 'caretaker',
            sessionVersion: 1,
            name: 'Caretaker Bob',
            timezone: 'Asia/Kolkata',
          },
        };
      });

      const req = new NextRequest('http://localhost:3000/api/pending/pend-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });

      const res = await POST(req, { params: { id: 'pend-1' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Only the Elder can approve or reject/);
    });

    it('allows Caretaker to cancel their pending proposal', async () => {
      vi.spyOn(authModule, 'checkCsrfOrigin').mockReturnValue(true);
      vi.spyOn(authModule, 'requireRole').mockResolvedValue({
        success: true,
        session: {
          profileId,
          role: 'caretaker',
          sessionVersion: 1,
          name: 'Caretaker Bob',
          timezone: 'Asia/Kolkata',
        },
      });

      vi.spyOn(pendingModule, 'cancelPendingChange').mockResolvedValue(true);

      const req = new NextRequest('http://localhost:3000/api/pending/pend-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });

      const res = await POST(req, { params: { id: 'pend-1' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('rejects POST when Origin header is invalid', async () => {
      vi.spyOn(authModule, 'checkCsrfOrigin').mockReturnValue(false);

      const req = new NextRequest('http://localhost:3000/api/pending/pend-1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil-attacker.com',
        },
        body: JSON.stringify({ action: 'approve' }),
      });

      const res = await POST(req, { params: { id: 'pend-1' } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid request origin/i);
    });
  });

  describe('Full Proposal Lifecycle (create, approve, reject, cancel)', () => {
    it('creates a pending change and sends elder email', async () => {
      const { getFirestore } = await import('@/lib/firebase');
      const mockSet = vi.fn().mockResolvedValue(undefined);
      const mockAdd = vi.fn().mockResolvedValue({ id: 'audit-1' });
      const mockProfileGet = vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ name: 'Elder John', emailElder: 'john@example.com' }),
      });
      const mockReminderLogGet = vi.fn().mockResolvedValue({ exists: false });

      (getFirestore as any).mockReturnValue({
        collection: (col: string) => {
          if (col === 'profiles') return { doc: () => ({ get: mockProfileGet }) };
          if (col === 'reminderLog') return { doc: () => ({ get: mockReminderLogGet, set: mockSet, update: mockSet }) };
          if (col === 'auditLog') return { add: mockAdd };
          return { doc: () => ({ id: 'pend-new-1', set: mockSet }) };
        },
      });

      const id = await pendingModule.createPendingChange(
        profileId,
        'medication_add',
        {
          name: 'Lisinopril',
          dose: '10mg',
          scheduleTimes: ['08:00'],
          withFood: false,
          startDate: '2026-11-15',
          pillCount: 30,
        },
        'caretaker',
      );

      expect(id).toBe('pend-new-1');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pend-new-1',
          profileId,
          type: 'medication_add',
          status: 'pending',
        }),
      );
    });

    it('approves a valid medication_add proposal and writes new medication', async () => {
      const { getFirestore } = await import('@/lib/firebase');

      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            id: 'pend-med-1',
            profileId,
            type: 'medication_add',
            payload: {
              name: 'Aspirin',
              dose: '81mg',
              scheduleTimes: ['09:00'],
              withFood: true,
              startDate: '2026-11-15',
              pillCount: 100,
            },
            status: 'pending',
            createdAt: new Date(),
          }),
        }),
        set: vi.fn(),
        update: vi.fn(),
      };

      (getFirestore as any).mockReturnValue({
        collection: (col: string) => ({
          doc: () => ({ id: col === 'medications' ? 'med-created-1' : 'pend-med-1' }),
          add: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        }),
        runTransaction: vi.fn().mockImplementation((cb) => cb(mockTx)),
      });

      const res = await approvePendingChange(profileId, 'pend-med-1', 'elder');
      expect(res.success).toBe(true);
      expect(res.appliedId).toBe('med-created-1');
      expect(mockTx.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'Aspirin',
          pillCount: 100,
          active: true,
        }),
      );
      expect(mockTx.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'approved' }),
      );
    });

    it('rejects a pending proposal with reason inside a transaction', async () => {
      const { getFirestore } = await import('@/lib/firebase');

      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            id: 'pend-med-2',
            profileId,
            type: 'medication_add',
            payload: { name: 'Aspirin' },
            status: 'pending',
            createdAt: new Date(),
          }),
        }),
        update: vi.fn(),
      };

      (getFirestore as any).mockReturnValue({
        collection: () => ({
          doc: () => ({ id: 'pend-med-2' }),
          add: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        }),
        runTransaction: vi.fn().mockImplementation((cb) => cb(mockTx)),
      });

      const res = await rejectPendingChange(
        profileId,
        'pend-med-2',
        'elder',
        'Doctor advised against this dose',
      );

      expect(res).toBe(true);
      expect(mockTx.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'rejected',
          rejectionReason: 'Doctor advised against this dose',
        }),
      );
    });

    it('approves appointment_add, medication_edit, and medication_delete', async () => {
      const { getFirestore } = await import('@/lib/firebase');

      // 1. appointment_add
      const mockTxAppt = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            id: 'pend-appt-1',
            profileId,
            type: 'appointment_add',
            payload: {
              doctor: 'Dr. Watson',
              place: 'Central Clinic',
              dateTime: '2026-11-20T10:00:00.000Z',
              notes: 'Fasting blood test',
            },
            status: 'pending',
            createdAt: new Date(),
          }),
        }),
        set: vi.fn(),
        update: vi.fn(),
      };

      (getFirestore as any).mockReturnValue({
        collection: (col: string) => ({
          doc: () => ({ id: col === 'appointments' ? 'appt-1' : 'pend-appt-1' }),
          add: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        }),
        runTransaction: vi.fn().mockImplementation((cb) => cb(mockTxAppt)),
      });

      const resAppt = await approvePendingChange(profileId, 'pend-appt-1', 'elder');
      expect(resAppt.success).toBe(true);
      expect(mockTxAppt.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ doctor: 'Dr. Watson', place: 'Central Clinic' }),
      );

      // 2. medication_delete (soft delete)
      const mockTxDelete = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            id: 'pend-del-1',
            profileId,
            type: 'medication_delete',
            payload: { medicationId: 'med-target-1' },
            status: 'pending',
            createdAt: new Date(),
          }),
        }),
        update: vi.fn(),
      };

      (getFirestore as any).mockReturnValue({
        collection: (col: string) => ({
          doc: () => ({ id: col === 'medications' ? 'med-target-1' : 'pend-del-1' }),
          add: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        }),
        runTransaction: vi.fn().mockImplementation((cb) => cb(mockTxDelete)),
      });

      const resDel = await approvePendingChange(profileId, 'pend-del-1', 'elder');
      expect(resDel.success).toBe(true);
      expect(mockTxDelete.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ active: false }),
      );
    });

    it('rejects approval if proposal does not exist or profileId mismatches', async () => {
      const { getFirestore } = await import('@/lib/firebase');

      // Not found
      const mockTxNotFound = {
        get: vi.fn().mockResolvedValue({ exists: false }),
      };
      (getFirestore as any).mockReturnValue({
        collection: () => ({ doc: () => ({ id: 'missing' }) }),
        runTransaction: vi.fn().mockImplementation((cb) => cb(mockTxNotFound)),
      });
      await expect(
        approvePendingChange(profileId, 'missing', 'elder'),
      ).rejects.toThrow(/not found/i);

      // Profile mismatch
      const mockTxMismatch = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            id: 'pend-other',
            profileId: 'other-profile-id',
            type: 'medication_add',
            payload: {},
            status: 'pending',
          }),
        }),
      };
      (getFirestore as any).mockReturnValue({
        collection: () => ({ doc: () => ({ id: 'pend-other' }) }),
        runTransaction: vi.fn().mockImplementation((cb) => cb(mockTxMismatch)),
      });
      await expect(
        approvePendingChange(profileId, 'pend-other', 'elder'),
      ).rejects.toThrow(/unauthorized/i);
    });

    it('getPendingChanges sorts proposals and expires changes older than 7 days', async () => {
      const { getFirestore } = await import('@/lib/firebase');
      const now = Date.now();
      const mockUpdate = vi.fn().mockResolvedValue(undefined);

      const docs = [
        {
          data: () => ({
            id: 'p-fresh',
            profileId,
            type: 'medication_add',
            payload: { name: 'Fresh Med' },
            status: 'pending',
            createdAt: new Date(now - 1000 * 60), // 1 min ago
          }),
          ref: { update: mockUpdate },
        },
        {
          data: () => ({
            id: 'p-expired',
            profileId,
            type: 'medication_add',
            payload: { name: 'Old Med' },
            status: 'pending',
            createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000), // 8 days ago
          }),
          ref: { update: mockUpdate },
        },
      ];

      (getFirestore as any).mockReturnValue({
        collection: () => ({
          where: () => ({
            get: vi.fn().mockResolvedValue({ docs }),
          }),
        }),
      });

      const list = await pendingModule.getPendingChanges(profileId);
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe('p-fresh');
      expect(list[0].status).toBe('pending');
      expect(list[1].id).toBe('p-expired');
      expect(list[1].status).toBe('expired');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'expired' }),
      );
    });
  });
});
