import { NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/db';
import { verifyPassword, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth';
import { isRateLimited, clientIp } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';

// bcrypt hash of a random value — never a valid password. Compared against on
// every failed lookup so "no such user" and "wrong password" take about the
// same time (docs/09-security.md §4).
const DUMMY_HASH = '$2a$12$6P0Ek1.6rh0MJebUHY3Rj.2/uKIj2ifeb5WM309t.t806Zmj7Ipgq';

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (await isRateLimited(`login:${ip}`, 10, 5 * 60 * 1000)) {
    await audit('login.rate_limited', { ip });
    return NextResponse.json(
      { error: 'Too many login attempts. Try again in a few minutes.' },
      { status: 429 },
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  const passwordOk = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    await audit('login.failure', { actor: email, ip });
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  await audit('login.success', { actor: user.email, ip, detail: `role=${user.role}` });
  const token = await createSessionToken(user);
  const res = NextResponse.json({
    user: { email: user.email, displayName: user.display_name, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
