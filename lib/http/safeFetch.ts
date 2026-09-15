import dns from 'node:dns/promises';

// SSRF-hardened fetch for URLs that aren't fully under our control (RSS feeds,
// a yard's own site). Blocks private / loopback / link-local / cloud-metadata
// addresses (IPv4 + IPv6), re-checks every redirect hop, and caps redirects,
// response size and time. docs/09-security.md §10.

const MAX_REDIRECTS = 3;
const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

export function isBlockedIpv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0 && p[2] === 0) return true; // 192.0.0.0/24
  if (a >= 224) return true; // multicast + reserved
  return false;
}

export function isBlockedIpv6(ip: string): boolean {
  const s = ip.toLowerCase().split('%')[0];
  if (s === '::1' || s === '::') return true; // loopback / unspecified
  if (s.startsWith('fe80:') || s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb'))
    return true; // link-local fe80::/10
  if (s.startsWith('fc') || s.startsWith('fd')) return true; // unique local fc00::/7
  if (s.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible
  const m = s.match(/(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return isBlockedIpv4(m[1]);
  return false;
}

export function isBlockedAddress(address: string, family: number): boolean {
  return family === 6 ? isBlockedIpv6(address) : isBlockedIpv4(address);
}

async function assertHostAllowed(hostname: string): Promise<void> {
  // Literal IPs: check directly.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isBlockedIpv4(hostname)) throw new Error(`blocked address: ${hostname}`);
    return;
  }
  if (hostname.includes(':')) {
    if (isBlockedIpv6(hostname)) throw new Error(`blocked address: ${hostname}`);
    return;
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error(`blocked host: ${hostname}`);
  }
  const records = await dns.lookup(hostname, { all: true });
  for (const r of records) {
    if (isBlockedAddress(r.address, r.family)) {
      throw new Error(`blocked address for ${hostname}: ${r.address}`);
    }
  }
}

export interface SafeFetchOptions {
  /** Hosts we trust (our own known APIs) — skip the DNS/IP check for these. */
  allowHosts?: string[];
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  /** Next.js cache revalidation (seconds). Omit for no-store. Ignored for POST. */
  revalidate?: number;
  /** Defaults to GET. POST bodies are never cached, regardless of `revalidate`. */
  method?: 'GET' | 'POST';
  body?: string;
}

/** Fetches a URL, returning the body text, or null on any failure/violation. */
export async function safeFetchText(rawUrl: string, opts: SafeFetchOptions = {}): Promise<string | null> {
  const allow = new Set((opts.allowHosts ?? []).map((h) => h.toLowerCase()));
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return null;
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (current.protocol !== 'http:' && current.protocol !== 'https:') return null;
      if (!allow.has(current.hostname.toLowerCase())) {
        await assertHostAllowed(current.hostname);
      }

      const res = await fetch(current, {
        redirect: 'manual',
        signal: ac.signal,
        headers: opts.headers,
        method: opts.method,
        body: opts.method === 'POST' ? opts.body : undefined,
        ...(opts.revalidate != null && opts.method !== 'POST'
          ? { next: { revalidate: opts.revalidate } }
          : { cache: 'no-store' as const }),
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc || hop === MAX_REDIRECTS) return null;
        current = new URL(loc, current); // re-validated at the top of the loop
        continue;
      }
      if (!res.ok || !res.body) return null;

      // Read with a byte cap.
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          reader.cancel();
          return null;
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
