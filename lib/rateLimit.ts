/**
 * In-memory sliding window rate limiter.
 * Per-key (email or IP), configurable window and max requests.
 * For multi-instance deployments, swap the Map for Redis.
 */

type Window = { count: number; resetAt: number };

const store = new Map<string, Window>();

// Clean up stale entries every 10 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, win] of store.entries()) {
      if (win.resetAt < now) store.delete(key);
    }
  }, 10 * 60 * 1000);
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number; limit: number; windowMs: number };

/**
 * @param key       Unique identifier — user email or IP address
 * @param limit     Max requests per window (default 30)
 * @param windowMs  Window duration in ms (default 60 000 = 1 min)
 */
export function checkRateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000
): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterMs: existing.resetAt - now, limit, windowMs };
  }

  existing.count += 1;
  return { allowed: true };
}

/** Extract a rate-limit key from a Next.js Request. Falls back to IP. */
export function rateLimitKey(req: Request, userEmail?: string | null): string {
  if (userEmail) return `user:${userEmail}`;
  const forwarded = (req.headers as any).get?.("x-forwarded-for") as string | null;
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  return `ip:${ip}`;
}
