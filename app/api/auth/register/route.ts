import { NextResponse } from 'next/server';
import { getUserByEmail, createPendingUser, listAdminIds, addUserNotification } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { isRateLimited, clientIp } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';

// Self sign-up (/registrer). The app is internal, and there's no e-mail to
// verify the address, so a new account is a *pending* viewer: it can't log in
// until an admin approves it (Admin → Brukere). Admins get a notification.
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (await isRateLimited(`register:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'For mange registreringer herfra — prøv igjen senere.' }, { status: 429 });
  }

  let body: { name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ugyldig forespørsel.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim().slice(0, 80);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 200);
  const password = String(body.password ?? '');
  if (name.length < 2) return NextResponse.json({ error: 'Skriv inn navnet ditt.' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Ugyldig e-postadresse.' }, { status: 400 });
  if (password.length < 10) return NextResponse.json({ error: 'Passordet må ha minst 10 tegn.' }, { status: 400 });
  if (password.length > 200) return NextResponse.json({ error: 'Passordet er for langt.' }, { status: 400 });

  // Same answer whether or not the address exists — no account enumeration.
  const ok = NextResponse.json({ ok: true }, { status: 201 });
  if (await getUserByEmail(email)) {
    await audit('register.duplicate', { actor: email, ip });
    return ok;
  }

  const id = await createPendingUser(email, name, await hashPassword(password));
  await audit('register.pending', { actor: email, ip });
  for (const adminId of await listAdminIds()) {
    await addUserNotification({ userId: adminId, type: 'user_signup', actorId: id });
  }
  return ok;
}
