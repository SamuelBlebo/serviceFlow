import { createHash } from "node:crypto";

/**
 * Fixed-window rate limiting backed by `rateLimits/{key}` documents, applied
 * inside the caller's transaction. The decision itself is pure.
 */
export interface RateLimitState {
  windowStartMs: number;
  count: number;
}

export type RateLimitDecision =
  | { allowed: true; next: RateLimitState }
  | { allowed: false; retryAfterSeconds: number };

export function decideRateLimit(
  state: RateLimitState | null,
  limit: number,
  windowSeconds: number,
  nowMs: number,
): RateLimitDecision {
  const windowMs = windowSeconds * 1000;
  if (!state || nowMs - state.windowStartMs >= windowMs) {
    return { allowed: true, next: { windowStartMs: nowMs, count: 1 } };
  }
  if (state.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((state.windowStartMs + windowMs - nowMs) / 1000) };
  }
  return { allowed: true, next: { windowStartMs: state.windowStartMs, count: state.count + 1 } };
}

/**
 * Rate-limit document key for a client IP. The IP is hashed so raw addresses
 * are never stored (privacy), but the same IP always maps to the same key.
 */
export function ipRateLimitKey(scope: string, ip: string): string {
  const digest = createHash("sha256").update(ip).digest("hex").slice(0, 32);
  return `${scope}_ip_${digest}`;
}
