import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { rateLimitHitDb } from './db';

// Durable, cross-instance rate limiting via Upstash Redis when configured
// (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — add the Upstash
// integration from the Vercel dashboard's Storage tab). Without it, falls back
// to an in-memory limiter scoped to a single warm serverless instance — still
// useful, but not a hard global cap (docs/09-security.md §9).
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const limiters = new Map<string, Ratelimit>();

function getRedisLimiter(limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      analytics: false,
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

const attempts = new Map<string, number[]>();

function isRateLimitedInMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (attempts.get(key) || []).filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    attempts.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  attempts.set(key, timestamps);

  if (attempts.size > 5000) {
    for (const [k, v] of attempts) {
      if (v.every((t) => now - t >= windowMs)) attempts.delete(k);
    }
  }

  return false;
}

// Tiers, best first:
//   1. Upstash Redis      — if UPSTASH_REDIS_REST_* is set
//   2. Turso (rate_limits) — if a shared TURSO_DATABASE_URL is set (durable
//      across serverless instances, no extra service)
//   3. in-memory          — per warm instance (dev, or prod before Turso)
export async function isRateLimited(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (process.env.SKIP_RATE_LIMIT === '1') return false; // e2e only
  if (redis) {
    const { success } = await getRedisLimiter(limit, windowMs).limit(key);
    return !success;
  }
  if (process.env.TURSO_DATABASE_URL) {
    try {
      return await rateLimitHitDb(key, limit, windowMs);
    } catch {
      /* fall through to in-memory */
    }
  }
  return isRateLimitedInMemory(key, limit, windowMs);
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0].trim() || 'unknown';
}
