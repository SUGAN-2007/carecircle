import { SignJWT, jwtVerify } from 'jose';
import { getEnv } from './env';

export type Role = 'elder' | 'caretaker' | 'family';

export interface SessionPayload {
  profileId: string;
  role: Role;
  sessionVersion: number;
}

/**
 * Cookie name configuration.
 * Uses __Host- prefix in production on HTTPS for maximum cookie security.
 * Falls back to cc_session in development over HTTP.
 */
export const COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Host-cc_session' : 'cc_session';

export const SESSION_DURATION_SECONDS = 8 * 60 * 60; // 8 hours

/**
 * Encodes secret key into a Uint8Array suitable for jose HS256.
 */
function getSecretKey(): Uint8Array {
  const secret = getEnv().SESSION_SECRET;
  return new TextEncoder().encode(secret);
}

/**
 * Signs a session JWT with jose HS256.
 */
export async function signSession(
  payload: SessionPayload,
  expiresInSeconds = SESSION_DURATION_SECONDS,
): Promise<string> {
  const key = getSecretKey();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(key);
}

/**
 * Verifies a session JWT signature and expiry.
 * Returns decoded payload if valid, or null if tampered/expired.
 */
export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const key = getSecretKey();
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });

    if (!payload.profileId || !payload.role || typeof payload.sessionVersion !== 'number') {
      return null;
    }

    const role = payload.role as string;
    if (role !== 'elder' && role !== 'caretaker' && role !== 'family') {
      return null;
    }

    return {
      profileId: payload.profileId as string,
      role: role as Role,
      sessionVersion: payload.sessionVersion as number,
    };
  } catch {
    return null;
  }
}
