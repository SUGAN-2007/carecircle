import { NextResponse, type NextRequest } from 'next/server';
import { verifyActionToken, executeActionToken } from '@/lib/actionToken';
import { getFirestore } from '@/lib/firebase';

/**
 * GET /api/action/[token]
 * Verifies the token and returns metadata for the confirmation page.
 * IMPORTANT: This does NOT execute or consume the token (prevents email scanner pre-fetches from triggering changes).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const { token } = params;
  if (!token) {
    return NextResponse.json({ valid: false, error: 'Token is required' }, { status: 400 });
  }

  const check = await verifyActionToken(token);
  if (!check.valid || !check.payload) {
    return NextResponse.json(
      { valid: false, error: check.error || 'Invalid or expired action link' },
      { status: 400 },
    );
  }

  const { doseLogId, action } = check.payload;
  let medicationName = 'Your Medication';

  try {
    const medId = doseLogId.substring(0, doseLogId.lastIndexOf('_'));
    if (medId) {
      const db = getFirestore();
      const medDoc = await db.collection('medications').doc(medId).get();
      if (medDoc.exists) {
        medicationName = medDoc.data()?.name || medicationName;
      }
    }
  } catch {
    // Non-blocking fallback
  }

  return NextResponse.json({
    valid: true,
    action,
    medicationName,
    doseLogId,
  });
}

/**
 * POST /api/action/[token]
 * Atomically consumes the token and applies the action (taken / snooze / skip).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const { token } = params;
  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  try {
    const result = await executeActionToken(token, 'email_one_tap');
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to execute action' },
      { status: 400 },
    );
  }
}
