import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';
import { getEnv } from './env';
import { getFirestore } from './firebase';
import { appendAuditLog } from './auditLog';

export type ActionType = 'taken' | 'snooze' | 'skip';

export interface ActionTokenPayload {
  doseLogId: string;
  profileId: string;
  action: ActionType;
  jti: string;
}

export interface ActionTokenDoc {
  tokenHash: string;
  doseLogId: string;
  profileId: string;
  action: ActionType;
  jti: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date | null;
}

export const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function getTokenSecret(): Uint8Array {
  return new TextEncoder().encode(getEnv().TOKEN_SECRET);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a signed 2-hour JWT token and records its SHA-256 hash in Firestore.
 */
export async function createActionToken(params: {
  doseLogId: string;
  profileId: string;
  action: ActionType;
  appUrl?: string;
}): Promise<{ token: string; url: string; tokenHash: string }> {
  const { doseLogId, profileId, action } = params;
  const appUrl = params.appUrl || getEnv().APP_URL.replace(/\/$/, '');
  const jti = crypto.randomUUID();
  const secret = getTokenSecret();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TWO_HOURS_MS);

  const token = await new SignJWT({
    doseLogId,
    profileId,
    action,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(jti)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);

  const tokenHash = hashToken(token);

  const db = getFirestore();
  await db.collection('actionTokens').doc(tokenHash).set({
    tokenHash,
    doseLogId,
    profileId,
    action,
    jti,
    createdAt: now,
    expiresAt,
    usedAt: null,
  });

  const url = `${appUrl}/action/${token}`;
  return { token, url, tokenHash };
}

/**
 * Verifies the token cryptographically and checks its database status.
 * This does NOT consume the token. Safe for GET confirmation views.
 */
export async function verifyActionToken(token: string): Promise<{
  valid: boolean;
  error?: string;
  payload?: ActionTokenPayload;
  tokenDoc?: ActionTokenDoc;
}> {
  try {
    const secret = getTokenSecret();
    const { payload } = await jwtVerify(token, secret);

    const doseLogId = payload.doseLogId as string;
    const profileId = payload.profileId as string;
    const action = payload.action as ActionType;
    const jti = payload.jti as string;

    if (!doseLogId || !profileId || !action || !jti) {
      return { valid: false, error: 'Malformed token payload' };
    }

    const tokenHash = hashToken(token);
    const db = getFirestore();
    const docSnap = await db.collection('actionTokens').doc(tokenHash).get();

    if (!docSnap.exists) {
      return { valid: false, error: 'Action token not found or invalid' };
    }

    const tokenDoc = docSnap.data() as ActionTokenDoc;

    if (tokenDoc.usedAt) {
      return { valid: false, error: 'This action token has already been used' };
    }

    const expTime = tokenDoc.expiresAt instanceof Date
      ? tokenDoc.expiresAt.getTime()
      : typeof (tokenDoc.expiresAt as any)?.toMillis === 'function'
      ? (tokenDoc.expiresAt as any).toMillis()
      : new Date(tokenDoc.expiresAt).getTime();

    if (Date.now() > expTime) {
      return { valid: false, error: 'This action link has expired (valid for 2 hours)' };
    }

    return {
      valid: true,
      payload: { doseLogId, profileId, action, jti },
      tokenDoc,
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid action token',
    };
  }
}

/**
 * Executes the one-tap action atomically inside a single Firestore transaction.
 * Enforces single-use by marking usedAt inside the transaction.
 */
export async function executeActionToken(
  token: string,
  actor = 'one_tap_email',
): Promise<{
  success: boolean;
  action: ActionType;
  message: string;
  medicationName?: string;
}> {
  // 1. Verify token signature first
  const verification = await verifyActionToken(token);
  if (!verification.valid || !verification.payload) {
    throw new Error(verification.error || 'Invalid or expired action link');
  }

  const { doseLogId, profileId, action } = verification.payload;
  const tokenHash = hashToken(token);
  const db = getFirestore();
  const now = new Date();

  const tokenRef = db.collection('actionTokens').doc(tokenHash);
  const doseRef = db.collection('doseLog').doc(doseLogId);

  // Extract medicationId from doseLogId (e.g. med123_202611150800)
  const medId = doseLogId.substring(0, doseLogId.lastIndexOf('_'));
  const medRef = medId ? db.collection('medications').doc(medId) : null;

  return db.runTransaction(async (tx) => {
    const tokenSnap = await tx.get(tokenRef);
    if (!tokenSnap.exists) {
      throw new Error('Action token was not found');
    }

    const tokenData = tokenSnap.data() as ActionTokenDoc;
    if (tokenData.usedAt) {
      throw new Error('This action link has already been used');
    }

    let medicationName = 'Medication';

    if (action === 'taken') {
      const doseSnap = await tx.get(doseRef);
      let existingMedName = '';

      if (doseSnap.exists) {
        const dData = doseSnap.data();
        existingMedName = dData?.medicationName || '';
        if (dData?.status === 'taken') {
          // Already marked taken
          tx.update(tokenRef, { usedAt: now });
          return {
            success: true,
            action,
            message: 'Medication dose was already recorded as taken.',
            medicationName: existingMedName,
          };
        }
      }

      if (medRef) {
        const medSnap = await tx.get(medRef);
        if (medSnap.exists) {
          const mData = medSnap.data();
          existingMedName = existingMedName || mData?.name || '';
          const currentCount = typeof mData?.pillCount === 'number' ? mData.pillCount : 0;
          const nextCount = Math.max(0, currentCount - 1);
          tx.update(medRef, { pillCount: nextCount, updatedAt: now });
        }
      }

      medicationName = existingMedName || medicationName;

      tx.set(
        doseRef,
        {
          id: doseLogId,
          profileId,
          medicationId: medId,
          medicationName,
          status: 'taken',
          loggedAt: now,
          loggedBy: actor,
          loggedByRole: 'elder',
          updatedAt: now,
        },
        { merge: true },
      );
    } else if (action === 'skip') {
      const doseSnap = await tx.get(doseRef);
      if (doseSnap.exists) {
        const dData = doseSnap.data();
        medicationName = dData?.medicationName || medicationName;
      } else if (medRef) {
        const medSnap = await tx.get(medRef);
        if (medSnap.exists) {
          medicationName = medSnap.data()?.name || medicationName;
        }
      }

      tx.set(
        doseRef,
        {
          id: doseLogId,
          profileId,
          medicationId: medId,
          medicationName,
          status: 'skipped',
          loggedAt: now,
          loggedBy: actor,
          loggedByRole: 'elder',
          updatedAt: now,
        },
        { merge: true },
      );
    } else if (action === 'snooze') {
      const doseSnap = await tx.get(doseRef);
      const doseData = doseSnap.exists ? doseSnap.data() : null;
      const currentSnoozes = doseData?.snoozeCount || 0;

      if (currentSnoozes >= 2) {
        throw new Error('Maximum 2 snoozes reached for this dose.');
      }

      medicationName = doseData?.medicationName || medicationName;
      const snoozedUntil = new Date(now.getTime() + 15 * 60 * 1000);

      tx.set(
        doseRef,
        {
          id: doseLogId,
          profileId,
          medicationId: medId,
          medicationName,
          snoozeCount: currentSnoozes + 1,
          snoozedUntil,
          updatedAt: now,
        },
        { merge: true },
      );
    }

    // Mark token as used inside the transaction
    tx.update(tokenRef, { usedAt: now });

    await appendAuditLog({
      profileId,
      actor,
      role: 'elder',
      action: `one_tap_${action}`,
      payload: { doseLogId, action },
    });

    const actionText =
      action === 'taken'
        ? 'Dose confirmed as taken! Pill inventory updated.'
        : action === 'snooze'
        ? 'Reminder snoozed for 15 minutes.'
        : 'Dose recorded as skipped.';

    return {
      success: true,
      action,
      message: actionText,
      medicationName,
    };
  });
}
