import { NextRequest, NextResponse } from 'next/server';
import { getUserById } from '@/lib/db';
import { verifyMagicLinkToken, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth';
import { isRateLimited, clientIp } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';

// Passwordless entry via a signed link (email it to guests). Exchanges the token
// for a normal session cookie and redirects to the app. Never grants admin.
export const dynamic = 'force-dynamic';

function safeNext(v: string | null): string {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/';
}

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  const loginUrl = new URL('/login', req.url);

  if (await isRateLimited(`magiclink:${ip}`, 20, 5 * 60 * 1000)) {
    loginUrl.searchParams.set('error', 'Too many attempts. Try again shortly.');
    return NextResponse.redirect(loginUrl);
  }

  const token = req.nextUrl.searchParams.get('t') || req.nextUrl.searchParams.get('token');
  const claims = token ? await verifyMagicLinkToken(token) : null;
  if (!claims) {
    await audit('login.magic_link_invalid', { ip });
    loginUrl.searchParams.set('error', 'This link is invalid or has expired.');
    return NextResponse.redirect(loginUrl);
  }

  const user = await getUserById(Number(claims.sub));
  if (!user || user.role === 'admin') {
    await audit('login.magic_link_invalid', { ip, actor: claims.email, detail: 'no user / admin refused' });
    loginUrl.searchParams.set('error', 'This link is no longer valid.');
    return NextResponse.redirect(loginUrl);
  }

  const session = await createSessionToken(user);
  const res = NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get('next')), req.url));
  res.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  await audit('login.magic_link', { actor: user.email, ip });
  return res;
}
