const MAX_ATTEMPTS  = 5;
const WINDOW_MS     = 15 * 60 * 1000;
const BLOCK_MS      = 15 * 60 * 1000;

interface AttemptRecord {
  count: number;
  firstAttempt: number;
  blockedUntil?: number;
}

const store = new Map<string, AttemptRecord>();

function getIp(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }): string {
  const fwd = req.headers["x-forwarded-for"];
  if (Array.isArray(fwd)) return fwd[0];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const r   = store.get(ip);
  if (r?.blockedUntil && now < r.blockedUntil) {
    return { allowed: false, retryAfterSec: Math.ceil((r.blockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

export function recordFailure(ip: string): void {
  const now = Date.now();
  const r   = store.get(ip);
  if (!r || now - r.firstAttempt > WINDOW_MS) {
    store.set(ip, { count: 1, firstAttempt: now });
    return;
  }
  r.count++;
  if (r.count >= MAX_ATTEMPTS) {
    r.blockedUntil = now + BLOCK_MS;
  }
}

export function recordSuccess(ip: string): void {
  store.delete(ip);
}

export { getIp };
