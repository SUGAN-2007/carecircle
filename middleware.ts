import { NextRequest, NextResponse } from 'next/server';

/**
 * Global middleware — two jobs:
 *   1. Set security headers on every response (including CSP).
 *   2. Gate /dashboard/* and /api/* (except /api/health and /api/action) behind
 *      a cookie presence check.  Actual session cryptographic verification
 *      happens inside each route handler via lib/auth.ts — middleware only
 *      checks for the cookie's existence so it can redirect early.
 *
 * CSP notes
 * ---------
 * Next.js 14 App Router injects inline <script> tags for hydration, so
 * 'unsafe-inline' is required for script-src when not using nonces.
 * 'unsafe-eval' is added in development only (Next.js fast-refresh).
 * In a future hardening pass, generate a per-request nonce here, forward it
 * via the `x-nonce` request header, and read it in layout.tsx to pass to
 * next/script — then replace 'unsafe-inline' with 'nonce-{nonce}'.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDev = process.env.NODE_ENV === 'development';

  // ── Security headers ──────────────────────────────────────────────────────
  const csp = [
    "default-src 'self'",
    // 'unsafe-inline' needed for Next.js hydration scripts.
    // 'unsafe-eval' only in dev (fast-refresh).
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",        // Tailwind inlines CSS-in-JS
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const response = NextResponse.next();

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  // HSTS — only meaningful in production over HTTPS
  if (!isDev) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }

  // ── Cookie-presence guard ─────────────────────────────────────────────────
  // Public paths that never need a session:
  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/action') ||     // one-tap token confirmation page
    pathname.startsWith('/api/action') || // one-tap token links
    pathname.startsWith('/api/cron') ||   // protected by CRON_SECRET, not cookie
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon');

  if (!isPublic) {
    const sessionCookie =
      request.cookies.get('__Host-cc_session') ||
      request.cookies.get('cc_session');
    if (!sessionCookie) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  // Run on all paths except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
