// Runs a scan against the running dev server (npm run dev in another terminal).
// Exercises the real cron code path. In dev, CRON_SECRET is optional.
//
//   npm run scan:local                 (discovery + rotating batch)
//   npm run scan:local -- --full       (discovery + every company's accounts)
//   npm run scan:local -- --secret X   (when CRON_SECRET is set)

const args = process.argv.slice(2);
const full = args.includes('--full');
const si = args.indexOf('--secret');
const secret = (si >= 0 ? args[si + 1] : undefined) || process.env.CRON_SECRET;
const base = process.env.BASE_URL || 'http://localhost:3000';

const url = `${base}/api/cron/scan${full ? '?full=1' : ''}`;
console.log(`GET ${url}`);
const res = await fetch(url, { headers: secret ? { authorization: `Bearer ${secret}` } : {} });
const text = await res.text();
console.log(`HTTP ${res.status}`);
try {
  console.dir(JSON.parse(text), { depth: 6 });
} catch {
  console.log(text);
}
process.exit(res.ok ? 0 : 1);
