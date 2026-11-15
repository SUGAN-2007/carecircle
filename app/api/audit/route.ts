import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getFirestore } from '@/lib/firebase';

/**
 * GET /api/audit?limit=30
 * Accessible strictly to the Elder role.
 * Returns the latest immutable audit log entries (never includes passcodes or tokens).
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(['elder'], req);
  if (!auth.success) return auth.response;

  const url = new URL(req.url);
  const limitParam = parseInt(url.searchParams.get('limit') || '30', 10);
  const limitCount = Math.min(Math.max(1, limitParam), 50);

  try {
    const db = getFirestore();
    const snap = await db
      .collection('auditLog')
      .where('profileId', '==', auth.session.profileId)
      .orderBy('timestamp', 'desc')
      .limit(limitCount)
      .get();

    const entries = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        actor: data.actor || 'unknown',
        role: data.role || 'unknown',
        action: data.action || '',
        payload: data.payload || {},
        timestamp: data.timestamp?.toDate
          ? data.timestamp.toDate().toISOString()
          : data.timestamp instanceof Date
          ? data.timestamp.toISOString()
          : new Date(data.timestamp || Date.now()).toISOString(),
      };
    });

    return NextResponse.json({ auditEntries: entries });
  } catch (err) {
    console.error('Failed to retrieve audit log:', err);
    return NextResponse.json(
      { error: 'Failed to load audit history' },
      { status: 500 },
    );
  }
}
