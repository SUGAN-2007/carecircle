import { NextResponse } from 'next/server';

/**
 * GET /api/health
 *
 * Public liveness check used by Vercel and monitoring tools.
 * Returns the current UTC timestamp so callers can verify clock skew.
 * Does NOT call getEnv() — intentionally stays dependency-free so it
 * responds even if environment variables are misconfigured.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'carecircle',
      ts: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        // Prevent caching of the health endpoint
        'Cache-Control': 'no-store',
      },
    },
  );
}
