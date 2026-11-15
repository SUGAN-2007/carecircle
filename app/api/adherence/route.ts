import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import { calculateAdherence } from '@/lib/adherence';

/**
 * GET /api/adherence?days=7|30
 * Accessible to all authenticated roles (Elder, Caretaker, Family).
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(['elder', 'caretaker', 'family'], req);
  if (!auth.success) return auth.response;

  const url = new URL(req.url);
  const daysParam = url.searchParams.get('days');
  const days: 7 | 30 = daysParam === '30' ? 30 : 7;

  try {
    const stats = await calculateAdherence(
      auth.session.profileId,
      days,
      auth.session.timezone || 'Asia/Kolkata',
    );

    return NextResponse.json({ adherence: stats });
  } catch (err) {
    console.error('Failed to calculate adherence:', err);
    return NextResponse.json({ error: 'Failed to calculate adherence' }, { status: 500 });
  }
}
