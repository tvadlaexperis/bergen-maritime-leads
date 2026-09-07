// Prints a bcrypt hash for use as ADMIN_PASSWORD_HASH (so no plaintext admin
// password lives in the environment).
//
//   npm run hash-password -- "your-strong-password"
//   npm run hash-password            # generates a random one and prints both

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const arg = process.argv[2];
const password = arg || crypto.randomBytes(12).toString('base64url');
const hash = bcrypt.hashSync(password, 12);

if (!arg) console.log('password:', password);
console.log('ADMIN_PASSWORD_HASH=' + hash);
