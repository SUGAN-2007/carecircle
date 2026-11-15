import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET } from '@/app/api/medications/route';
import { DELETE, PUT } from '@/app/api/medications/[id]/route';
import * as authModule from '@/lib/auth';
import * as medicationsModule from '@/lib/medications';
import { NextRequest } from 'next/server';

describe('Medications Role Permission & Pending Flow', () => {
  const profileId = 'prof-test-1';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows Elder to create medication directly', async () => {
    vi.spyOn(authModule, 'requireRole').mockResolvedValue({
      success: true,
      session: {
        profileId,
        role: 'elder',
        sessionVersion: 1,
        name: 'Elder Margaret',
        timezone: 'Asia/Kolkata',
      },
    });

    const createSpy = vi
      .spyOn(medicationsModule, 'createMedication')
      .mockResolvedValue({
        id: 'med-new-1',
        profileId,
        name: 'Metformin',
        dose: '500mg',
        scheduleTimes: ['08:00'],
        withFood: true,
        startDate: '2026-11-15',
        endDate: null,
        pillCount: 30,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const req = new NextRequest('http://localhost:3000/api/medications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Metformin',
        dose: '500mg',
        scheduleTimes: ['08:00'],
        withFood: true,
        startDate: '2026-11-15',
        pillCount: 30,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(createSpy).toHaveBeenCalledWith(
      profileId,
      expect.objectContaining({ name: 'Metformin' }),
      'elder',
    );
  });

  it('routes Caretaker medication proposal to pendingChanges collection (status: pending)', async () => {
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

    const pendingSpy = vi
      .spyOn(medicationsModule, 'createPendingChange')
      .mockResolvedValue('pending-change-123');

    const req = new NextRequest('http://localhost:3000/api/medications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Aspirin',
        dose: '100mg',
        scheduleTimes: ['09:00'],
        withFood: false,
        startDate: '2026-11-15',
        pillCount: 20,
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.status).toBe('pending_approval');
    expect(body.pendingChangeId).toBe('pending-change-123');
    expect(pendingSpy).toHaveBeenCalledWith(
      profileId,
      'medication_add',
      expect.objectContaining({ name: 'Aspirin' }),
      'caretaker',
    );
  });

  it('rejects Family member from creating or modifying medications with 403', async () => {
    vi.spyOn(authModule, 'requireRole').mockResolvedValue({
      success: false,
      response: new Response(
        JSON.stringify({ error: 'Forbidden: Insufficient privileges for this role' }),
        { status: 403 },
      ) as any,
    });

    const req = new NextRequest('http://localhost:3000/api/medications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Aspirin',
        dose: '100mg',
        scheduleTimes: ['09:00'],
        startDate: '2026-11-15',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('performs soft delete (active: false) when Elder deletes a medication', async () => {
    vi.spyOn(authModule, 'requireRole').mockResolvedValue({
      success: true,
      session: {
        profileId,
        role: 'elder',
        sessionVersion: 1,
        name: 'Elder Margaret',
        timezone: 'Asia/Kolkata',
      },
    });

    const deleteSpy = vi
      .spyOn(medicationsModule, 'softDeleteMedication')
      .mockResolvedValue(true);

    const req = new NextRequest('http://localhost:3000/api/medications/med-1', {
      method: 'DELETE',
    });

    const res = await DELETE(req, { params: { id: 'med-1' } });
    expect(res.status).toBe(200);
    expect(deleteSpy).toHaveBeenCalledWith(profileId, 'med-1', 'elder');
  });
});
