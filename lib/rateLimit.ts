import { createHash } from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';

export interface RateLimitResult {
  allowed: boolean;
  attemptsRemaining: number;
  resetAt: Date;
  lockoutSeconds: number;
}

/**
 * Computes a deterministic SHA-256 doc ID for Firestore.
 * Avoids invalid character issues in Firestore document keys.
 */
export function getRateLimitDocId(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Enforces rate limiting using a deterministic Firestore doc ID and a transaction.
 *
 * @param db Firestore instance
 * @param key Unique key (e.g. `login_${profileId}_${ip}` or `ip_${ip}`)
 * @param maxAttempts Max failed attempts before lockout (default: 5)
 * @param windowMs Window/lockout duration in ms (default: 15 minutes)
 */
export async function checkRateLimit(
  db: Firestore,
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000,
): Promise<RateLimitResult> {
  const docId = getRateLimitDocId(key);
  const ref = db.collection('rateLimits').doc(docId);
  const now = Date.now();

  const snap = await ref.get();
  if (!snap.exists) {
    return {
      allowed: true,
      attemptsRemaining: maxAttempts,
      resetAt: new Date(now + windowMs),
      lockoutSeconds: 0,
    };
  }

  const data = snap.data() || {};
  const attempts = (data.attempts as number) || 0;
  const resetAtTime = (data.resetAt?.toMillis?.() ?? data.resetAt ?? 0) as number;

  if (now > resetAtTime) {
    // Window has expired; clear previous counter
    return {
      allowed: true,
      attemptsRemaining: maxAttempts,
      resetAt: new Date(now + windowMs),
      lockoutSeconds: 0,
    };
  }

  if (attempts >= maxAttempts) {
    const lockoutSeconds = Math.ceil((resetAtTime - now) / 1000);
    return {
      allowed: false,
      attemptsRemaining: 0,
      resetAt: new Date(resetAtTime),
      lockoutSeconds: Math.max(1, lockoutSeconds),
    };
  }

  return {
    allowed: true,
    attemptsRemaining: maxAttempts - attempts,
    resetAt: new Date(resetAtTime),
    lockoutSeconds: 0,
  };
}

/**
 * Increments failed attempt count in a Firestore transaction.
 */
export async function recordFailedAttempt(
  db: Firestore,
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000,
): Promise<RateLimitResult> {
  const docId = getRateLimitDocId(key);
  const ref = db.collection('rateLimits').doc(docId);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let attempts = 0;
    let resetAtTime = now + windowMs;

    if (snap.exists) {
      const data = snap.data() || {};
      const existingReset = (data.resetAt?.toMillis?.() ?? data.resetAt ?? 0) as number;
      if (now <= existingReset) {
        attempts = (data.attempts as number) || 0;
        resetAtTime = existingReset;
      }
    }

    attempts += 1;
    tx.set(ref, {
      key,
      attempts,
      resetAt: new Date(resetAtTime),
      updatedAt: new Date(now),
    });

    const isLocked = attempts >= maxAttempts;
    const lockoutSeconds = isLocked ? Math.ceil((resetAtTime - now) / 1000) : 0;

    return {
      allowed: !isLocked,
      attemptsRemaining: Math.max(0, maxAttempts - attempts),
      resetAt: new Date(resetAtTime),
      lockoutSeconds: Math.max(0, lockoutSeconds),
    };
  });
}

/**
 * Resets the rate limit upon successful authentication.
 */
export async function resetRateLimit(
  db: Firestore,
  key: string,
): Promise<void> {
  const docId = getRateLimitDocId(key);
  const ref = db.collection('rateLimits').doc(docId);
  await ref.delete().catch(() => {});
}
