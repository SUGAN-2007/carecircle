import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getTodayDoses } from '@/lib/doseLog';

/**
 * GET /api/doses/today
 * Returns today's scheduled doses merged with recorded logs for the user's profile.
 * Accessible to all authenticated roles.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(['elder', 'caretaker', 'family'], req);
  if (!auth.success) return auth.response;

  try {
    const doses = await getTodayDoses(
      auth.session.profileId,
      auth.session.timezone || 'Asia/Kolkata',
    );

    return NextResponse.json({ doses });
  } catch (err) {
    console.error('Failed to load today doses:', err);
    return NextResponse.json({ error: 'Failed to load today doses' }, { status: 500 });
  }
}
