// Creates or updates an app user. No signup UI — this is how admin accounts
// get provisioned. Points at local.db by default; pass TURSO_DATABASE_URL /
// TURSO_AUTH_TOKEN to provision in production.
//
//   node scripts/create-user.mjs --email=you@example.com --role=admin --name="Your Name" [--password=...]
//
// Without --password a random one is generated and printed once. Re-running for
// an existing email updates role/name; the password changes only if --password
// is passed.

import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'local.db');
const VALID_ROLES = ['viewer', 'admin'];

function getClient() {
  return process.env.TURSO_DATABASE_URL
    ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
    : createClient({ url: `file:${DB_PATH}` });
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = (args.email || '').trim().toLowerCase();
  const role = args.role || 'viewer';
  const name = args.name || email.split('@')[0];

  if (!email.includes('@')) {
    console.error('Usage: node scripts/create-user.mjs --email=you@example.com --role=admin --name="Your Name"');
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". One of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const db = getClient();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at INTEGER NOT NULL
    );
  `);

  const existing = (await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] })).rows[0];
  const generated = args.password ? null : crypto.randomBytes(9).toString('base64url');
  const password = args.password || generated;

  if (existing) {
    if (args.password) {
      await db.execute({
        sql: 'UPDATE users SET role = ?, display_name = ?, password_hash = ? WHERE id = ?',
        args: [role, name, bcrypt.hashSync(password, 12), existing.id],
      });
    } else {
      await db.execute({
        sql: 'UPDATE users SET role = ?, display_name = ? WHERE id = ?',
        args: [role, name, existing.id],
      });
    }
    console.log(`Updated ${email}: role=${role}${args.password ? ', password changed' : ''}`);
  } else {
    await db.execute({
      sql: `INSERT INTO users (email, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: [email, bcrypt.hashSync(password, 12), name, role, Date.now()],
    });
    console.log(`Created ${email}: role=${role}`);
    if (generated) console.log(`  Generated password: ${generated}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
