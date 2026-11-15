import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { getFirestore } from '@/lib/firebase';
import { DEFAULT_ESCALATION_CONFIG } from '@/lib/escalation';
import { appendAuditLog } from '@/lib/auditLog';

const escalationSchema = z.object({
  enabled: z.boolean(),
  elderMinutes: z.number().int().min(5).max(180),
  caretakerMinutes: z.number().int().min(15).max(360),
  familyMinutes: z.number().int().min(30).max(720),
});

/**
 * GET /api/profiles/escalation
 * Elder view of escalation settings.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(['elder'], req);
  if (!auth.success) return auth.response;

  const db = getFirestore();
  const profileDoc = await db.collection('profiles').doc(auth.session.profileId).get();

  if (!profileDoc.exists) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const data = profileDoc.data();
  const config = data?.escalation || DEFAULT_ESCALATION_CONFIG;

  return NextResponse.json({ escalation: config });
}

/**
 * POST /api/profiles/escalation
 * Elder updates escalation settings.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(['elder'], req);
  if (!auth.success) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 });
  }

  const parsed = escalationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid escalation settings' },
      { status: 400 },
    );
  }

  const db = getFirestore();
  const profileRef = db.collection('profiles').doc(auth.session.profileId);
  const now = new Date();

  await profileRef.update({
    escalation: parsed.data,
    updatedAt: now,
  });

  await appendAuditLog({
    profileId: auth.session.profileId,
    actor: auth.session.name || 'Elder',
    role: 'elder',
    action: 'escalation_settings_updated',
    payload: parsed.data,
  });

  return NextResponse.json({
    success: true,
    escalation: parsed.data,
    message: 'Escalation settings updated successfully.',
  });
}
