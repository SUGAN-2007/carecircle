import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import {
  updateAppointment,
  deleteAppointment,
  updateAppointmentSchema,
} from '@/lib/appointments';
import { createPendingChange } from '@/lib/medications';

/**
 * PUT /api/appointments/[id]
 * - Elder: updates directly.
 * - Caretaker: proposes update in pendingChanges.
 * - Family: 403.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(['elder', 'caretaker'], req);
  if (!auth.success) return auth.response;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Appointment ID required' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 });
  }

  const parsed = updateAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid appointment update' },
      { status: 400 },
    );
  }

  const { profileId, role } = auth.session;

  try {
    if (role === 'elder') {
      const updated = await updateAppointment(profileId, id, parsed.data, 'elder');
      if (!updated) {
        return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, appointment: updated });
    }

    // Caretaker
    const pendingChangeId = await createPendingChange(
      profileId,
      'appointment_edit',
      { appointmentId: id, ...parsed.data },
      'caretaker',
    );

    return NextResponse.json(
      {
        success: true,
        status: 'pending_approval',
        pendingChangeId,
        message: 'Appointment update proposal submitted for Elder approval.',
      },
      { status: 202 },
    );
  } catch (err) {
    console.error('Error updating appointment:', err);
    return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 });
  }
}

/**
 * DELETE /api/appointments/[id]
 * - Elder: deletes directly.
 * - Caretaker: proposes deletion in pendingChanges.
 * - Family: 403.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(['elder', 'caretaker'], req);
  if (!auth.success) return auth.response;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Appointment ID required' }, { status: 400 });
  }

  const { profileId, role } = auth.session;

  try {
    if (role === 'elder') {
      const ok = await deleteAppointment(profileId, id, 'elder');
      if (!ok) {
        return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, message: 'Appointment deleted' });
    }

    // Caretaker
    const pendingChangeId = await createPendingChange(
      profileId,
      'appointment_delete',
      { appointmentId: id },
      'caretaker',
    );

    return NextResponse.json(
      {
        success: true,
        status: 'pending_approval',
        pendingChangeId,
        message: 'Appointment deletion proposal submitted for Elder approval.',
      },
      { status: 202 },
    );
  } catch (err) {
    console.error('Error deleting appointment:', err);
    return NextResponse.json({ error: 'Failed to delete appointment' }, { status: 500 });
  }
}
