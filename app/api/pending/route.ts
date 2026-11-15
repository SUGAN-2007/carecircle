import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getPendingChanges } from '@/lib/pendingChanges';

/**
 * GET /api/pending
 * Accessible to Elder and Caretaker (Family gets 403).
 * Lists all pending proposals for the authenticated profile.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(['elder', 'caretaker'], req);
  if (!auth.success) return auth.response;

  try {
    const list = await getPendingChanges(auth.session.profileId);
    return NextResponse.json({ pendingChanges: list });
  } catch (err) {
    console.error('Failed to get pending changes:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve pending changes' },
      { status: 500 },
    );
  }
}
