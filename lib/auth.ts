import { cookies, headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, verifySessionToken, type Role, type SessionPayload } from './session';
import { getFirestore } from './firebase';
import { getEnv } from './env';

export interface ActiveSession extends SessionPayload {
  name: string;
  timezone: string;
}

/**
 * Cryptographically verifies the session cookie, checks expiration,
 * and validates that the sessionVersion matches the profile document in Firestore.
 * Supports passing a Request or raw token directly (useful in route handlers and tests).
 */
export async function getSession(
  requestOrToken?: NextRequest | Request | string,
): Promise<ActiveSession | null> {
  let token: string | undefined;

  if (typeof requestOrToken === 'string') {
    token = requestOrToken;
  } else if (requestOrToken) {
    if ('cookies' in requestOrToken && typeof (requestOrToken as any).cookies?.get === 'function') {
      token =
        (requestOrToken as any).cookies.get(COOKIE_NAME)?.value ||
        (requestOrToken as any).cookies.get('cc_session')?.value;
    } else {
      const cookieHeader = requestOrToken.headers.get('cookie') || '';
      const match = cookieHeader.match(
        new RegExp(`(?:^|;\\s*)(?:${COOKIE_NAME}|cc_session)=([^;]+)`),
      );
      if (match) token = match[1];
    }
  }

  if (!token) {
    try {
      const cookieStore = cookies();
      token =
        cookieStore.get(COOKIE_NAME)?.value ||
        cookieStore.get('cc_session')?.value;
    } catch {
      // Outside of Next.js async storage (e.g. testing environment)
      token = undefined;
    }
  }

  if (!token) return null;

  const verified = await verifySessionToken(token);
  if (!verified) return null;

  try {
    const db = getFirestore();
    const profileDoc = await db.collection('profiles').doc(verified.profileId).get();
    if (!profileDoc.exists) return null;

    const data = profileDoc.data();
    if (!data) return null;

    // Reject if session was invalidated via rotation or logout
    if (data.sessionVersion !== verified.sessionVersion) {
      return null;
    }

    return {
      profileId: verified.profileId,
      role: verified.role,
      sessionVersion: verified.sessionVersion,
      name: data.name || 'CareCircle User',
      timezone: data.timezone || 'Asia/Kolkata',
    };
  } catch (err) {
    console.error('Error validating profile sessionVersion:', err);
    return null;
  }
}

/**
 * Validates CSRF protection by checking the Origin header against APP_URL
 * for state-modifying HTTP methods (POST, PUT, DELETE, PATCH).
 */
export function checkCsrfOrigin(request?: NextRequest | Request): boolean {
  const reqHeaders = request ? request.headers : headers();
  const origin = reqHeaders.get('origin');
  if (!origin) {
    // If no origin header is sent (e.g. server-to-server or non-browser), check fetch-site
    const fetchSite = reqHeaders.get('sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
      return false;
    }
    return true;
  }

  try {
    const appUrl = getEnv().APP_URL;
    const expectedOrigin = new URL(appUrl).origin;
    const requestOrigin = new URL(origin).origin;

    // Allow localhost/127.0.0.1 in non-production
    if (process.env.NODE_ENV !== 'production') {
      if (
        requestOrigin.includes('localhost') ||
        requestOrigin.includes('127.0.0.1')
      ) {
        return true;
      }
    }

    return requestOrigin === expectedOrigin;
  } catch {
    return false;
  }
}

export type RouteHandlerResult<T = unknown> =
  | { success: true; session: ActiveSession; data?: T }
  | { success: false; response: NextResponse };

/**
 * Gatekeeper for API route handlers.
 * 1. Verifies Origin header for state-modifying requests (CSRF protection).
 * 2. Authenticates session cryptographic validity and database sessionVersion.
 * 3. Enforces least-privilege role check against allowedRoles.
 */
export async function requireRole(
  allowedRoles: Role[],
  request?: NextRequest | Request,
): Promise<RouteHandlerResult> {
  const method = request?.method?.toUpperCase() || '';
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    if (!checkCsrfOrigin(request)) {
      return {
        success: false,
        response: NextResponse.json(
          { error: 'Forbidden: Invalid request origin' },
          { status: 403 },
        ),
      };
    }
  }

  const session = await getSession(request);
  if (!session) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Unauthorized: Session missing or invalid' },
        { status: 401 },
      ),
    };
  }

  if (!allowedRoles.includes(session.role)) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Forbidden: Insufficient privileges for this role' },
        { status: 403 },
      ),
    };
  }

  return { success: true, session };
}
