/**
 * Idempotency key for mutating callables. Generate one per user intent (e.g.
 * when a form opens) and reuse it for retries of that same intent, so a
 * timeout + retry can never apply the action twice on the server.
 */
export function newRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "")}`;
}
