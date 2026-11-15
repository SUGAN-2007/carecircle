import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { requireRole } from '@/lib/auth';
import { hashPasscode } from '@/lib/hash';
import { getFirestore } from '@/lib/firebase';
import { appendAuditLog } from '@/lib/auditLog';
import { signSession, COOKIE_NAME } from '@/lib/session';

const rotateSchema = z.object({
  targetRole: z.enum(['elder', 'caretaker', 'family']),
  newPasscode: z
    .string()
    .regex(/^\d{6,}$/, 'New passcode must be at least 6 digits'),
});

export async function POST(req: NextRequest) {
  // Only the Elder has authorization to rotate passcodes
  const auth = await requireRole(['elder'], req);
  if (!auth.success) {
    return auth.response;
  }

  const { session } = auth;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 });
  }

  const parsed = rotateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid rotation input' },
      { status: 400 },
    );
  }

  const { targetRole, newPasscode } = parsed.data;
  const db = getFirestore();
  const profileRef = db.collection('profiles').doc(session.profileId);

  try {
    const newHash = await hashPasscode(newPasscode);
    const hashFieldMap = {
      elder: 'elderHash',
      caretaker: 'caretakerHash',
      family: 'familyHash',
    } as const;

    const hashField = hashFieldMap[targetRole];

    // Atomically increment sessionVersion to revoke all active sessions for this profile
    await profileRef.update({
      [hashField]: newHash,
      sessionVersion: FieldValue.increment(1),
      updatedAt: new Date(),
    });

    // Read the newly incremented sessionVersion
    const updatedDoc = await profileRef.get();
    const newSessionVersion = (updatedDoc.data()?.sessionVersion as number) || session.sessionVersion + 1;

    await appendAuditLog({
      profileId: session.profileId,
      actor: 'elder',
      role: 'elder',
      action: 'passcode_rotated',
      payload: { targetRole, newSessionVersion },
    });

    // Re-issue a fresh session cookie for the current Elder so they remain logged in
    const newToken = await signSession({
      profileId: session.profileId,
      role: 'elder',
      sessionVersion: newSessionVersion,
    });

    const isProd = process.env.NODE_ENV === 'production';
    const response = NextResponse.json({
      success: true,
      message: `Passcode for ${targetRole} rotated successfully. All existing sessions have been terminated.`,
    });

    response.cookies.set({
      name: COOKIE_NAME,
      value: newToken,
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60,
    });

    return response;
  } catch (err) {
    console.error('Passcode rotation error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred during passcode rotation.' },
      { status: 500 },
    );
  }
}
