import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME } from '@/lib/session';
import { getSession, checkCsrfOrigin } from '@/lib/auth';
import { appendAuditLog } from '@/lib/auditLog';

export async function POST(req: NextRequest) {
  if (!checkCsrfOrigin(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const session = await getSession(req);

  if (session) {
    await appendAuditLog({
      profileId: session.profileId,
      actor: session.role,
      role: session.role,
      action: 'logout',
    });
  }

  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });

  // Clear session cookie
  response.cookies.set({
    name: COOKIE_NAME,
    value: '',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });

  // Also clear dev fallback cookie if present
  response.cookies.set({
    name: 'cc_session',
    value: '',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
