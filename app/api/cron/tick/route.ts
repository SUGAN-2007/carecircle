import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { getEnv } from '@/lib/env';
import { runReminderTick } from '@/lib/reminderEngine';

/**
 * Maximum function execution duration on Vercel serverless.
 */
export const maxDuration = 60;

/**
 * Constant-time comparison between incoming header and CRON_SECRET.
 * Prevents timing attacks on the cron trigger secret.
 */
function verifyCronSecret(req: NextRequest): boolean {
  const incoming = req.headers.get('x-cron-secret');
  if (!incoming) return false;

  const expected = getEnv().CRON_SECRET;
  const inBuf = Buffer.from(incoming);
  const expBuf = Buffer.from(expected);

  if (inBuf.length !== expBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(inBuf, expBuf);
}

async function handleTick(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    // Return empty 401 with no timing or debugging information
    return new NextResponse(null, { status: 401 });
  }

  try {
    const result = await runReminderTick(new Date());

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Cron tick execution error:', err);
    return NextResponse.json(
      { error: 'An error occurred during cron tick execution.' },
      { status: 500 },
    );
  }
}

/**
 * External schedulers (e.g. cron-job.org) can trigger via GET or POST.
 */
export async function GET(req: NextRequest) {
  return handleTick(req);
}

export async function POST(req: NextRequest) {
  return handleTick(req);
}
