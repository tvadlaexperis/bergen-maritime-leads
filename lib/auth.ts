import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import type { User, Role } from './db';

export const SESSION_COOKIE = 'session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const SESSION_MAX_AGE = SESSION_DURATION_SECONDS;

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // No silent dev fallback — a predictable secret lets anyone forge an admin
    // session (docs/09-security.md §3).
    throw new Error('SESSION_SECRET environment variable is required (set it in .env.local)');
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface SessionPayload {
  sub: string; // user id
  email: string;
  displayName: string;
  role: Role;
}

export async function createSessionToken(user: User): Promise<string> {
  return new SignJWT({ email: user.email, displayName: user.display_name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

// --- Magic links (passwordless entry for the shared guest account) ---
// A signed, expiring token that /api/auth/link exchanges for a normal session.
// Never grants admin — the route double-checks the resolved user's role.

export async function createMagicLinkToken(userId: string, email: string, days: number): Promise<string> {
  return new SignJWT({ email, kind: 'magiclink' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(getSecretKey());
}

export async function verifyMagicLinkToken(token: string): Promise<{ sub: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.kind !== 'magiclink') return null;
    return { sub: String(payload.sub), email: String(payload.email) };
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return {
      sub: String(payload.sub),
      email: String(payload.email),
      displayName: String(payload.displayName),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

// Server Components / Route Handlers / Server Actions only.
export async function getCurrentUser(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// Throws if there is no valid session at all. Middleware already gates every
// route, but Server Actions and loaders re-check (defense in depth).
export async function requireUser(): Promise<SessionPayload> {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}

// Throws if there is no admin session — call at the top of every mutating
// Server Action and admin loader. Gating in JSX alone is a view gate, not a
// security gate (docs/09-security.md §5 — the eVent /internal lesson).
export async function requireAdmin(): Promise<SessionPayload> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}
