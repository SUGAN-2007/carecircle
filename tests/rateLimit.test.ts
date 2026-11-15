import { describe, it, expect, vi } from 'vitest';
import {
  getRateLimitDocId,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
} from '@/lib/rateLimit';

describe('Deterministic Firestore Rate Limiter', () => {
  it('computes deterministic, valid SHA-256 doc IDs', () => {
    const id1 = getRateLimitDocId('login_profile1_127.0.0.1');
    const id2 = getRateLimitDocId('login_profile1_127.0.0.1');
    const id3 = getRateLimitDocId('login_profile2_127.0.0.1');

    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles in-memory simulated rate limit checks, lockouts, and resets', async () => {
    // Mock Firestore memory store
    const store = new Map<string, any>();

    const mockDb: any = {
      collection: () => ({
        doc: (docId: string) => ({
          get: async () => ({
            exists: store.has(docId),
            data: () => store.get(docId),
          }),
          delete: async () => {
            store.delete(docId);
          },
        }),
      }),
      runTransaction: async (updateFunction: (tx: any) => Promise<any>) => {
        const tx = {
          get: async (ref: any) => {
            const docId = getRateLimitDocId('test-key');
            return {
              exists: store.has(docId),
              data: () => store.get(docId),
            };
          },
          set: (ref: any, data: any) => {
            const docId = getRateLimitDocId('test-key');
            store.set(docId, data);
          },
        };
        return updateFunction(tx);
      },
    };

    // 1. Initial check: should be allowed with 5 attempts remaining
    const initial = await checkRateLimit(mockDb, 'test-key', 5, 60000);
    expect(initial.allowed).toBe(true);
    expect(initial.attemptsRemaining).toBe(5);

    // 2. Record 4 failed attempts
    for (let i = 1; i <= 4; i++) {
      const res = await recordFailedAttempt(mockDb, 'test-key', 5, 60000);
      expect(res.allowed).toBe(true);
      expect(res.attemptsRemaining).toBe(5 - i);
    }

    // 3. 5th attempt triggers lockout
    const fifth = await recordFailedAttempt(mockDb, 'test-key', 5, 60000);
    expect(fifth.allowed).toBe(false);
    expect(fifth.attemptsRemaining).toBe(0);
    expect(fifth.lockoutSeconds).toBeGreaterThan(0);

    // 4. Subsequent check is blocked
    const lockedCheck = await checkRateLimit(mockDb, 'test-key', 5, 60000);
    expect(lockedCheck.allowed).toBe(false);

    // 5. Successful reset clears rate limit
    await resetRateLimit(mockDb, 'test-key');
    const afterReset = await checkRateLimit(mockDb, 'test-key', 5, 60000);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.attemptsRemaining).toBe(5);
  });
});
