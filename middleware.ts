import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'session';

// --- CSP (minmatside pattern) --------------------------------------------
// Script execution locked to a per-request nonce (+ 'strict-dynamic' so Next's
// code-split chunks still load). Dev gets a looser policy because Fast Refresh
// needs eval().
function buildCsp(nonce: string): string {
  const scriptSrc =
    process.env.NODE_ENV === 'production'
      ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `'self' 'unsafe-eval' 'unsafe-inline'`;
  return `
    default-src 'self';
    script-src ${scriptSrc};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data:;
    font-src 'self';
    connect-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `
    .replace(/\s{2,}/g, ' ')
    .trim();
}

type Session = { role?: string } | null;

async function readSession(request: NextRequest): Promise<Session> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload as Session;
  } catch {
    return null;
  }
}

// Paths reachable without a session. Everything else in the matcher requires
// one (docs/09-security.md §8 — this is an internal tool, not a public site).
const PUBLIC_PATHS = new Set(['/login', '/robots.txt', '/icon.svg', '/favicon.ico']);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // /api/auth/* handles its own auth; /api/cron/* is bearer-token protected.
  if (pathname.startsWith('/api/auth/') || pathname.startsWith('/api/cron/')) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isPublic(pathname)) {
    const session = await readSession(request);
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
    // Admin area needs the admin role on top of a valid session.
    if (pathname.startsWith('/admin') && session.role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Run on everything except Next's static assets and image optimiser — API
  // routes included, so /api/orchestrator/* is gated too.
  matcher: ['/((?!_next/static|_next/image).*)'],
};
