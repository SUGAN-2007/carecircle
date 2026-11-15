import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { logDose } from '@/lib/doseLog';

const logDoseSchema = z.object({
  scheduledSlot: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/, 'Slot must be YYYY-MM-DD HH:mm'),
  status: z.enum(['taken', 'skipped']),
});

/**
 * POST /api/medications/[id]/log
 * - Accessible to Elder and Caretaker only (Family 403).
 * - Logs dose with deterministic doc ID (${medId}_${YYYYMMDDHHmm}).
 * - Decrements pill count on 'taken' in the same transaction.
 * - Rejects logging a dose scheduled > 2 hours in the future.
 */
export async function POST(
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

  const parsed = logDoseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid log parameters' },
      { status: 400 },
    );
  }

  const { profileId, role, timezone } = auth.session;
  const { scheduledSlot, status } = parsed.data;

  try {
    const result = await logDose({
      profileId,
      medicationId: id,
      scheduledSlot,
      timezone: timezone || 'Asia/Kolkata',
      status,
      loggedBy: role,
      loggedByRole: role,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to log dose' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      alreadyLogged: result.alreadyLogged,
      pillCountRemaining: result.pillCountRemaining,
      message: result.alreadyLogged
        ? `This dose was already recorded as ${result.status}.`
        : `Dose recorded as ${result.status}.`,
    });
  } catch (err) {
    console.error('Error logging dose:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to record dose' },
      { status: 500 },
    );
  }
}
