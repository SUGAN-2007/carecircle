import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getFirestore } from '@/lib/firebase';
import { comparePasscode, DUMMY_HASH } from '@/lib/hash';
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
} from '@/lib/rateLimit';
import { signSession, COOKIE_NAME, type Role } from '@/lib/session';
import { appendAuditLog } from '@/lib/auditLog';
import { checkCsrfOrigin } from '@/lib/auth';

const loginSchema = z.object({
  profileCode: z.string().trim().min(4, 'Profile code is required'),
  passcode: z.string().trim().min(6, 'Passcode must be at least 6 digits'),
});

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return '127.0.0.1';
}

const GENERIC_AUTH_ERROR = 'Invalid profile code or passcode.';

export async function POST(req: NextRequest) {
  if (!checkCsrfOrigin(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const ip = getClientIp(req);
  const db = getFirestore();

  // 1. IP-level broad rate-limit (20 attempts / 15 minutes)
  const ipCheck = await checkRateLimit(db, `ip_${ip}`, 20, 15 * 60 * 1000);
  if (!ipCheck.allowed) {
    return NextResponse.json(
      {
        error: `Too many failed login attempts from this network. Try again in ${ipCheck.lockoutSeconds} seconds.`,
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    await recordFailedAttempt(db, `ip_${ip}`, 20, 15 * 60 * 1000);
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  const { profileCode, passcode } = parsed.data;

  try {
    // 2. Locate profile by profileCode (case-insensitive lookup)
    const snapshot = await db
      .collection('profiles')
      .where('profileCode', '==', profileCode.toUpperCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      // Counter account enumeration: run constant-time comparison against dummy hash
      await comparePasscode(passcode, DUMMY_HASH);
      await recordFailedAttempt(db, `ip_${ip}`, 20, 15 * 60 * 1000);
      await appendAuditLog({
        profileId: 'unknown',
        actor: ip,
        role: 'unauthenticated',
        action: 'login_failed',
        payload: { reason: 'profile_not_found', ip },
      });
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    const doc = snapshot.docs[0];
    const profile = doc.data();
    const profileId = doc.id;

    // 3. Rate-limit by profileId + IP: 5 failed attempts = 15-minute lockout
    const rateLimitKey = `login_${profileId}_${ip}`;
    const profileCheck = await checkRateLimit(db, rateLimitKey, 5, 15 * 60 * 1000);
    if (!profileCheck.allowed) {
      await appendAuditLog({
        profileId,
        actor: ip,
        role: 'unauthenticated',
        action: 'login_locked_out',
        payload: { ip, lockoutSeconds: profileCheck.lockoutSeconds },
      });
      return NextResponse.json(
        {
          error: `Account temporarily locked due to multiple failed attempts. Please retry in ${profileCheck.lockoutSeconds} seconds.`,
        },
        { status: 429 },
      );
    }

    // 4. Test passcode against all three role hashes
    let matchedRole: Role | null = null;

    if (profile.elderHash && (await comparePasscode(passcode, profile.elderHash))) {
      matchedRole = 'elder';
    } else if (
      profile.caretakerHash &&
      (await comparePasscode(passcode, profile.caretakerHash))
    ) {
      matchedRole = 'caretaker';
    } else if (
      profile.familyHash &&
      (await comparePasscode(passcode, profile.familyHash))
    ) {
      matchedRole = 'family';
    }

    if (!matchedRole) {
      // Record failure on both profileId+IP and IP keys
      const updated = await recordFailedAttempt(db, rateLimitKey, 5, 15 * 60 * 1000);
      await recordFailedAttempt(db, `ip_${ip}`, 20, 15 * 60 * 1000);

      await appendAuditLog({
        profileId,
        actor: ip,
        role: 'unauthenticated',
        action: 'login_failed',
        payload: { attemptsRemaining: updated.attemptsRemaining, ip },
      });

      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    // 5. Successful authentication
    await resetRateLimit(db, rateLimitKey);

    const sessionVersion = (profile.sessionVersion as number) || 1;
    const token = await signSession({
      profileId,
      role: matchedRole,
      sessionVersion,
    });

    await appendAuditLog({
      profileId,
      actor: ip,
      role: matchedRole,
      action: 'login_success',
      payload: { role: matchedRole, ip },
    });

    const isProd = process.env.NODE_ENV === 'production';
    const response = NextResponse.json({
      success: true,
      role: matchedRole,
      name: profile.name,
      redirect: `/${matchedRole}`,
    });

    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60, // 8 hours
    });

    return response;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json(
      { error: 'An unexpected authentication error occurred.' },
      { status: 500 },
    );
  }
}
