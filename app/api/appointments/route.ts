import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import {
  getAppointments,
  createAppointment,
  createAppointmentSchema,
} from '@/lib/appointments';
import { createPendingChange } from '@/lib/medications';

/**
 * GET /api/appointments
 * Accessible to all authenticated roles (Elder, Caretaker, Family).
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(['elder', 'caretaker', 'family'], req);
  if (!auth.success) return auth.response;

  try {
    const list = await getAppointments(auth.session.profileId);
    return NextResponse.json({ appointments: list });
  } catch (err) {
    console.error('Failed to get appointments:', err);
    return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500 });
  }
}

/**
 * POST /api/appointments
 * - Elder: writes directly.
 * - Caretaker: creates a pendingChanges proposal.
 * - Family: 403.
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

  const parsed = createAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid appointment details' },
      { status: 400 },
    );
  }

  const { profileId, role } = auth.session;

  try {
    if (role === 'elder') {
      const appt = await createAppointment(profileId, parsed.data, 'elder');
      return NextResponse.json({ success: true, appointment: appt }, { status: 201 });
    }

    // Caretaker
    const pendingChangeId = await createPendingChange(
      profileId,
      'appointment_add',
      parsed.data,
      'caretaker',
    );

    return NextResponse.json(
      {
        success: true,
        status: 'pending_approval',
        pendingChangeId,
        message: 'Appointment proposal submitted for Elder approval.',
      },
      { status: 202 },
    );
  } catch (err) {
    console.error('Error creating appointment:', err);
    return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}
