import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import {
  updateMedication,
  softDeleteMedication,
  createPendingChange,
  updateMedicationSchema,
} from '@/lib/medications';

/**
 * PUT /api/medications/[id]
 * - Elder: updates medication directly.
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
    return NextResponse.json({ error: 'Medication ID required' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 });
  }

  const parsed = updateMedicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid update data' },
      { status: 400 },
    );
  }

  const { profileId, role } = auth.session;

  try {
    if (role === 'elder') {
      const updated = await updateMedication(profileId, id, parsed.data, 'elder');
      if (!updated) {
        return NextResponse.json({ error: 'Medication not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, medication: updated });
    }

    // Caretaker
    const pendingChangeId = await createPendingChange(
      profileId,
      'medication_edit',
      { medicationId: id, ...parsed.data },
      'caretaker',
    );

    return NextResponse.json(
      {
        success: true,
        status: 'pending_approval',
        pendingChangeId,
        message: 'Medication edit proposal submitted for Elder approval.',
      },
      { status: 202 },
    );
  } catch (err) {
    console.error('Error updating medication:', err);
    return NextResponse.json({ error: 'Failed to update medication' }, { status: 500 });
  }
}

/**
 * DELETE /api/medications/[id]
 * - Elder: soft deletes (active: false).
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
    return NextResponse.json({ error: 'Medication ID required' }, { status: 400 });
  }

  const { profileId, role } = auth.session;

  try {
    if (role === 'elder') {
      const ok = await softDeleteMedication(profileId, id, 'elder');
      if (!ok) {
        return NextResponse.json({ error: 'Medication not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, message: 'Medication deactivated' });
    }

    // Caretaker
    const pendingChangeId = await createPendingChange(
      profileId,
      'medication_delete',
      { medicationId: id },
      'caretaker',
    );

    return NextResponse.json(
      {
        success: true,
        status: 'pending_approval',
        pendingChangeId,
        message: 'Medication deletion proposal submitted for Elder approval.',
      },
      { status: 202 },
    );
  } catch (err) {
    console.error('Error deleting medication:', err);
    return NextResponse.json({ error: 'Failed to delete medication' }, { status: 500 });
  }
}
