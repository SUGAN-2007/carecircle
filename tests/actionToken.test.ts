import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createActionToken,
  verifyActionToken,
  executeActionToken,
  hashToken,
} from '@/lib/actionToken';
import { GET, POST } from '@/app/api/action/[token]/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase', () => ({
  getFirestore: vi.fn(),
}));

describe('One-Tap Email Action Tokens', () => {
  const profileId = 'prof-action-1';
  const doseLogId = 'med123_202611150800';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a signed 2-hour action token and writes SHA-256 hash to Firestore', async () => {
    const { getFirestore } = await import('@/lib/firebase');
    const mockSet = vi.fn().mockResolvedValue(undefined);
    const mockDoc = vi.fn().mockReturnValue({ set: mockSet });
    (getFirestore as any).mockReturnValue({
      collection: vi.fn().mockReturnValue({ doc: mockDoc }),
    });

    const res = await createActionToken({
      doseLogId,
      profileId,
      action: 'taken',
      appUrl: 'https://carecircle.vercel.app',
    });

    expect(res.token).toBeDefined();
    expect(res.tokenHash).toBe(hashToken(res.token));
    expect(res.url).toBe(`https://carecircle.vercel.app/action/${res.token}`);
    expect(mockDoc).toHaveBeenCalledWith(res.tokenHash);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: res.tokenHash,
        doseLogId,
        profileId,
        action: 'taken',
        usedAt: null,
      }),
    );
  });

  it('GET /api/action/[token] verifies without consuming the token (pre-fetch safe)', async () => {
    const { getFirestore } = await import('@/lib/firebase');

    // Create a real signed token
    const mockSet = vi.fn().mockResolvedValue(undefined);
    const mockActionTokenDoc = {
      tokenHash: '',
      doseLogId,
      profileId,
      action: 'taken',
      jti: 'jti-123',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600 * 1000),
      usedAt: null, // NOT used
    };

    const created = await createActionToken({
      doseLogId,
      profileId,
      action: 'taken',
    });

    mockActionTokenDoc.tokenHash = created.tokenHash;

    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => mockActionTokenDoc,
    });

    const mockMedGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ name: 'Atorvastatin' }),
    });

    (getFirestore as any).mockReturnValue({
      collection: (col: string) => {
        if (col === 'actionTokens') {
          return { doc: () => ({ get: mockGet, set: mockSet }) };
        }
        if (col === 'medications') {
          return { doc: () => ({ get: mockMedGet }) };
        }
        return { doc: () => ({ get: mockGet }) };
      },
    });

    const req = new NextRequest(`http://localhost:3000/api/action/${created.token}`);
    const res = await GET(req, { params: { token: created.token } });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.action).toBe('taken');
    expect(data.medicationName).toBe('Atorvastatin');
    // Verify token was NOT consumed
    expect(mockActionTokenDoc.usedAt).toBeNull();
  });

  it('rejects tampered or invalid tokens', async () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiJ9.invalidpayload.fakesignature';
    const check = await verifyActionToken(fakeToken);
    expect(check.valid).toBe(false);
  });

  it('executes action transactionally, marks token as used, and prevents double execution', async () => {
    const { getFirestore } = await import('@/lib/firebase');

    const created = await createActionToken({
      doseLogId,
      profileId,
      action: 'taken',
    });

    let tokenDocUsedAt: Date | null = null;
    const mockTx = {
      get: vi.fn().mockImplementation((ref) => {
        if (ref.path === 'actionTokens') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              tokenHash: created.tokenHash,
              doseLogId,
              profileId,
              action: 'taken',
              expiresAt: new Date(Date.now() + 3600 * 1000),
              usedAt: tokenDocUsedAt,
            }),
          });
        }
        if (ref.path === 'doseLog') {
          return Promise.resolve({
            exists: false,
            data: () => undefined,
          });
        }
        if (ref.path === 'medications') {
          return Promise.resolve({
            exists: true,
            data: () => ({ name: 'Metformin', pillCount: 20 }),
          });
        }
        return Promise.resolve({ exists: false, data: () => ({}) });
      }),
      set: vi.fn(),
      update: vi.fn().mockImplementation((ref, data) => {
        if (ref.path === 'actionTokens') {
          tokenDocUsedAt = data.usedAt;
        }
      }),
    };

    (getFirestore as any).mockReturnValue({
      collection: (col: string) => ({
        add: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        doc: () => ({
          path: col,
          set: vi.fn().mockResolvedValue(undefined),
          get: () =>
            Promise.resolve({
              exists: true,
              data: () => ({
                tokenHash: created.tokenHash,
                doseLogId,
                profileId,
                action: 'taken',
                expiresAt: new Date(Date.now() + 3600 * 1000),
                usedAt: tokenDocUsedAt,
              }),
            }),
        }),
      }),
      runTransaction: vi.fn().mockImplementation((cb) => cb(mockTx)),
    });

    // 1st Execution: Succeeds
    const firstResult = await executeActionToken(created.token);
    expect(firstResult.success).toBe(true);
    expect(mockTx.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'taken',
        id: doseLogId,
      }),
      { merge: true },
    );
    expect(mockTx.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ usedAt: expect.any(Date) }),
    );

    // 2nd Execution: Must fail cleanly
    await expect(executeActionToken(created.token)).rejects.toThrow(
      /already been used/i,
    );
  });

  it('enforces maximum 2 snoozes per dose', async () => {
    const { getFirestore } = await import('@/lib/firebase');

    (getFirestore as any).mockReturnValue({
      collection: () => ({
        doc: () => ({
          set: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    });

    const created = await createActionToken({
      doseLogId,
      profileId,
      action: 'snooze',
    });

    const mockTx = {
      get: vi.fn().mockImplementation((ref) => {
        if (ref.path === 'actionTokens') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              tokenHash: created.tokenHash,
              doseLogId,
              profileId,
              action: 'snooze',
              expiresAt: new Date(Date.now() + 3600 * 1000),
              usedAt: null,
            }),
          });
        }
        if (ref.path === 'doseLog') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              snoozeCount: 2, // Already snoozed twice!
            }),
          });
        }
        return Promise.resolve({ exists: false, data: () => ({}) });
      }),
      set: vi.fn(),
      update: vi.fn(),
    };

    (getFirestore as any).mockReturnValue({
      collection: (col: string) => ({
        doc: () => ({
          path: col,
          get: () =>
            Promise.resolve({
              exists: true,
              data: () => ({
                tokenHash: created.tokenHash,
                doseLogId,
                profileId,
                action: 'snooze',
                expiresAt: new Date(Date.now() + 3600 * 1000),
                usedAt: null,
              }),
            }),
        }),
      }),
      runTransaction: vi.fn().mockImplementation((cb) => cb(mockTx)),
    });

    await expect(executeActionToken(created.token)).rejects.toThrow(
      /Maximum 2 snoozes reached/i,
    );
  });
});
