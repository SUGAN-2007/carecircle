import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { getFirestore } from '@/lib/firebase';
import { hashPasscode } from '@/lib/hash';
import { recordFailedAttempt, checkRateLimit } from '@/lib/rateLimit';
import { appendAuditLog } from '@/lib/auditLog';
import { checkCsrfOrigin } from '@/lib/auth';

/**
 * Validates IANA timezone string against the JavaScript runtime Intl database.
 */
function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const createProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    timezone: z
      .string()
      .trim()
      .default('Asia/Kolkata')
      .refine(isValidTimeZone, { message: 'Invalid IANA timezone string' }),
    emailElder: z.string().trim().email('Invalid Elder email address'),
    emailCaretaker: z.string().trim().email('Invalid Caretaker email address'),
    emailFamily: z.string().trim().email('Invalid Family email address'),
    passcodeElder: z
      .string()
      .regex(/^\d{6,}$/, 'Elder passcode must be at least 6 digits'),
    passcodeCaretaker: z
      .string()
      .regex(/^\d{6,}$/, 'Caretaker passcode must be at least 6 digits'),
    passcodeFamily: z
      .string()
      .regex(/^\d{6,}$/, 'Family passcode must be at least 6 digits'),
  })
  .refine(
    (data) =>
      data.passcodeElder !== data.passcodeCaretaker &&
      data.passcodeElder !== data.passcodeFamily &&
      data.passcodeCaretaker !== data.passcodeFamily,
    {
      message: 'All three passcodes must be unique from one another',
      path: ['passcodeFamily'],
    },
  );

/**
 * Generates an unguessable 12-character alphanumeric profile code.
 * Example format: "CC-7X9B-4K2M"
 */
function generateProfileCode(): string {
  const bytes = randomBytes(6).toString('hex').toUpperCase();
  return `CC-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}`;
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return '127.0.0.1';
}

export async function POST(req: NextRequest) {
  if (!checkCsrfOrigin(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const ip = getClientIp(req);
  const db = getFirestore();

  // Rate limit profile creation by IP: max 5 profile creations per hour
  const rateCheck = await checkRateLimit(db, `profile_create_${ip}`, 5, 60 * 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: `Too many profile creation attempts. Please wait ${rateCheck.lockoutSeconds} seconds.`,
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const parsed = createProfileSchema.safeParse(body);
  if (!parsed.success) {
    await recordFailedAttempt(db, `profile_create_${ip}`, 5, 60 * 60 * 1000);
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Validation failed' },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    // Generate code and hash all three passcodes with bcrypt
    const profileCode = generateProfileCode();
    const [elderHash, caretakerHash, familyHash] = await Promise.all([
      hashPasscode(data.passcodeElder),
      hashPasscode(data.passcodeCaretaker),
      hashPasscode(data.passcodeFamily),
    ]);

    const profileRef = db.collection('profiles').doc();
    const now = new Date();

    const profileDoc = {
      id: profileRef.id,
      profileCode,
      name: data.name,
      timezone: data.timezone,
      emailElder: data.emailElder,
      emailCaretaker: data.emailCaretaker,
      emailFamily: data.emailFamily,
      elderHash,
      caretakerHash,
      familyHash,
      sessionVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    await profileRef.set(profileDoc);

    // Audit log profile creation
    await appendAuditLog({
      profileId: profileRef.id,
      actor: ip,
      role: 'unauthenticated',
      action: 'profile_created',
      payload: {
        name: data.name,
        profileCode,
        timezone: data.timezone,
      },
    });

    // Return profileCode ONCE. Passcodes and hashes are never returned or logged.
    return NextResponse.json(
      {
        success: true,
        profileId: profileRef.id,
        profileCode,
        message:
          'Profile created successfully. Please record your credentials securely. They will not be shown again.',
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('Failed to create profile:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred while creating the profile.' },
      { status: 500 },
    );
  }
}
