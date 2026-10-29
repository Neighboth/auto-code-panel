type Entry = { count: number; resetAt: number };

const map = new Map<string, Entry>();

function sweep() {
  if (map.size < 2000) return;
  const now = Date.now();
  for (const [key, entry] of map) {
    if (now > entry.resetAt) map.delete(key);
  }
}

/**
 * Fixed-window login rate limiter: at most `limit` attempts per `windowMs`.
 * The key should combine the login scope and the supplied identifier.
 */
export function hitRateLimit(
  key: string,
  limit = 5,
  windowMs = 60_000,
): { allowed: boolean; retryInSeconds: number } {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now > entry.resetAt) {
    sweep();
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryInSeconds: 0 };
  }
  if (entry.count >= limit) {
    return { allowed: false, retryInSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { allowed: true, retryInSeconds: 0 };
}

export function recordSuccess(key: string) {
  map.delete(key);
}
