import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import {
  getActiveMedications,
  createMedication,
  createPendingChange,
  createMedicationSchema,
} from '@/lib/medications';

/**
 * GET /api/medications
 * Accessible to all authenticated roles (Elder, Caretaker, Family).
 * Returns all active medications for the user's profile.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(['elder', 'caretaker', 'family'], req);
  if (!auth.success) return auth.response;

  try {
    const meds = await getActiveMedications(auth.session.profileId);
    return NextResponse.json({ medications: meds });
  } catch (err) {
    console.error('Failed to fetch medications:', err);
    return NextResponse.json({ error: 'Failed to fetch medications' }, { status: 500 });
  }
}

/**
 * POST /api/medications
 * - Elder: writes directly to medications.
 * - Caretaker: creates a pendingChanges proposal for Elder approval.
 * - Family: 403 Forbidden.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(['elder', 'caretaker'], req);
  if (!auth.success) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 });
  }

  const parsed = createMedicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid medication details' },
      { status: 400 },
    );
  }

  const { profileId, role } = auth.session;

  try {
    if (role === 'elder') {
      const med = await createMedication(profileId, parsed.data, 'elder');
      return NextResponse.json({ success: true, medication: med }, { status: 201 });
    }

    // Caretaker: propose change for Elder approval
    const pendingChangeId = await createPendingChange(
      profileId,
      'medication_add',
      parsed.data,
      'caretaker',
    );

    return NextResponse.json(
      {
        success: true,
        status: 'pending_approval',
        pendingChangeId,
        message: 'Medication addition proposal submitted for Elder approval.',
      },
      { status: 202 },
    );
  } catch (err) {
    console.error('Error creating medication:', err);
    return NextResponse.json({ error: 'Failed to process medication request' }, { status: 500 });
  }
}
