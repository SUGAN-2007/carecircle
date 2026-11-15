import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireRole, checkCsrfOrigin } from '@/lib/auth';
import { signSession } from '@/lib/session';
import { getFirestore } from '@/lib/firebase';

vi.mock('@/lib/firebase', () => ({
  getFirestore: vi.fn(),
  getFirebaseAdmin: vi.fn(),
}));

describe('Role-based Access Control & Session Invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates CSRF Origin header for POST/PUT/DELETE requests', () => {
    const validReq = new Request('http://localhost:3000/api/medications', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
      },
    });
    expect(checkCsrfOrigin(validReq)).toBe(true);

    const evilReq = new Request('http://localhost:3000/api/medications', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.evil.com',
      },
    });
    expect(checkCsrfOrigin(evilReq)).toBe(false);
  });

  it('rejects access when no cookie or invalid session is present', async () => {
    // 1. No cookie header
    const noCookieReq = new Request('http://localhost:3000/api/medications');
    const resultNoCookie = await requireRole(['elder'], noCookieReq);
    expect(resultNoCookie.success).toBe(false);
    if (!resultNoCookie.success) {
      expect(resultNoCookie.response.status).toBe(401);
    }

    // 2. Cookie present but bad token signature
    const badTokenReq = new Request('http://localhost:3000/api/medications', {
      headers: { cookie: 'cc_session=bad.token.signature' },
    });
    const resultBadToken = await requireRole(['elder'], badTokenReq);
    expect(resultBadToken.success).toBe(false);
    if (!resultBadToken.success) {
      expect(resultBadToken.response.status).toBe(401);
    }
  });

  it('rejects access when user role is not in allowedRoles list', async () => {
    const familyToken = await signSession({
      profileId: 'p1',
      role: 'family',
      sessionVersion: 1,
    });

    const mockDb: any = {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({
              sessionVersion: 1,
              name: 'Family Member',
              timezone: 'Asia/Kolkata',
            }),
          }),
        }),
      }),
    };
    vi.mocked(getFirestore).mockReturnValue(mockDb);

    const req = new Request('http://localhost:3000/api/medications', {
      headers: { cookie: `cc_session=${familyToken}` },
    });

    // Attempting action that requires elder or caretaker
    const result = await requireRole(['elder', 'caretaker'], req);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(403);
    }
  });

  it('rejects session if database sessionVersion has been incremented (e.g. after rotation)', async () => {
    // Token has old sessionVersion = 1
    const oldToken = await signSession({
      profileId: 'p1',
      role: 'elder',
      sessionVersion: 1,
    });

    // Firestore has sessionVersion = 2 (rotated)
    const mockDb: any = {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({
              sessionVersion: 2,
              name: 'Elder User',
              timezone: 'Asia/Kolkata',
            }),
          }),
        }),
      }),
    };
    vi.mocked(getFirestore).mockReturnValue(mockDb);

    const req = new Request('http://localhost:3000/api/medications', {
      headers: { cookie: `cc_session=${oldToken}` },
    });

    const result = await requireRole(['elder'], req);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(401);
    }
  });

  it('grants access when role matches and sessionVersion is in sync', async () => {
    const validToken = await signSession({
      profileId: 'p1',
      role: 'elder',
      sessionVersion: 1,
    });

    const mockDb: any = {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({
              sessionVersion: 1,
              name: 'Margaret Smith',
              timezone: 'Asia/Kolkata',
            }),
          }),
        }),
      }),
    };
    vi.mocked(getFirestore).mockReturnValue(mockDb);

    const req = new Request('http://localhost:3000/api/medications', {
      headers: { cookie: `cc_session=${validToken}` },
    });

    const result = await requireRole(['elder'], req);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.session.profileId).toBe('p1');
      expect(result.session.role).toBe('elder');
      expect(result.session.name).toBe('Margaret Smith');
    }
  });
});
