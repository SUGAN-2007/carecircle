import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import {
  approvePendingChange,
  rejectPendingChange,
  cancelPendingChange,
} from '@/lib/pendingChanges';

const actionSchema = z.object({
  action: z.enum(['approve', 'reject', 'cancel']),
  reason: z.string().trim().max(300).optional(),
});

/**
 * POST /api/pending/[id]
 * - 'approve' / 'reject': Strictly Elder only.
 * - 'cancel': Caretaker or Elder.
 * - Enforces CSRF Origin check via requireRole.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Proposal ID is required' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid action' },
      { status: 400 },
    );
  }

  const { action, reason } = parsed.data;

  // Role permissions check
  if (action === 'approve' || action === 'reject') {
    const elderAuth = await requireRole(['elder'], req);
    if (!elderAuth.success) return elderAuth.response;

    try {
      if (action === 'approve') {
        const result = await approvePendingChange(
          elderAuth.session.profileId,
          id,
          elderAuth.session.name || 'Elder',
        );
        return NextResponse.json({
          success: true,
          action: 'approved',
          appliedId: result.appliedId,
          message: 'Proposal approved and applied to your healthcare schedule.',
        });
      } else {
        await rejectPendingChange(
          elderAuth.session.profileId,
          id,
          elderAuth.session.name || 'Elder',
          reason,
        );
        return NextResponse.json({
          success: true,
          action: 'rejected',
          message: 'Proposal rejected.',
        });
      }
    } catch (err) {
      console.error(`Error processing ${action}:`, err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : `Failed to ${action} proposal` },
        { status: 400 },
      );
    }
  }

  // Cancel action (Caretaker or Elder)
  const caretakerAuth = await requireRole(['caretaker', 'elder'], req);
  if (!caretakerAuth.success) return caretakerAuth.response;

  try {
    const ok = await cancelPendingChange(
      caretakerAuth.session.profileId,
      id,
      caretakerAuth.session.role,
    );

    if (!ok) {
      return NextResponse.json(
        { error: 'Proposal not found or cannot be cancelled' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      action: 'cancelled',
      message: 'Proposal cancelled successfully.',
    });
  } catch (err) {
    console.error('Error cancelling proposal:', err);
    return NextResponse.json(
      { error: 'Failed to cancel proposal' },
      { status: 500 },
    );
  }
}
