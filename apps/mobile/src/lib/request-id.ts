/**
 * Idempotency key for a callable. One key per user action, reused on retry,
 * so a resend after a dropped connection can't apply the action twice.
 * Uniqueness (not secrecy) is what matters, so Math.random is sufficient.
 */
export function newRequestId(prefix = "req"): string {
  const random = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join("");
  return `${prefix}_${Date.now().toString(36)}${random}`.slice(0, 64);
}
