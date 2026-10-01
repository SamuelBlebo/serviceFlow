import { OTP_POLICY } from "@serviceflow/shared";

/**
 * Pure OTP decisions (no I/O, unit-tested). The Firestore service applies
 * them inside transactions. Times are epoch milliseconds.
 */

/** Server-side state of the single active OTP challenge for one phone number. */
export interface OtpChallengeState {
  expiresAtMs: number;
  attempts: number;
  lastSentAtMs: number;
  windowStartMs: number;
  sendsInWindow: number;
}

export type SendDecision =
  | { allowed: true; windowStartMs: number; sendsInWindow: number }
  | { allowed: false; reason: "cooldown" | "window"; retryAfterSeconds: number };

/**
 * May we send a new code? Enforces the resend cooldown and the per-phone
 * window cap. A new code always replaces the previous one and resets attempts.
 */
export function decideSend(existing: OtpChallengeState | null, nowMs: number): SendDecision {
  if (!existing) return { allowed: true, windowStartMs: nowMs, sendsInWindow: 1 };

  const sinceLastSend = nowMs - existing.lastSentAtMs;
  const cooldownMs = OTP_POLICY.resendCooldownSeconds * 1000;
  if (sinceLastSend < cooldownMs) {
    return { allowed: false, reason: "cooldown", retryAfterSeconds: Math.ceil((cooldownMs - sinceLastSend) / 1000) };
  }

  const windowMs = OTP_POLICY.sendWindowSeconds * 1000;
  if (nowMs - existing.windowStartMs >= windowMs) {
    return { allowed: true, windowStartMs: nowMs, sendsInWindow: 1 };
  }
  if (existing.sendsInWindow >= OTP_POLICY.maxSendsPerWindow) {
    return {
      allowed: false,
      reason: "window",
      retryAfterSeconds: Math.ceil((existing.windowStartMs + windowMs - nowMs) / 1000),
    };
  }
  return { allowed: true, windowStartMs: existing.windowStartMs, sendsInWindow: existing.sendsInWindow + 1 };
}

export type VerifyDecision = "check" | "missing" | "expired" | "locked";

/** Can a submitted code be checked against this challenge at all? */
export function decideVerify(existing: OtpChallengeState | null, nowMs: number): VerifyDecision {
  if (!existing) return "missing";
  if (existing.attempts >= OTP_POLICY.maxAttempts) return "locked";
  if (nowMs >= existing.expiresAtMs) return "expired";
  return "check";
}

export function attemptsRemaining(attemptsSoFar: number): number {
  return Math.max(0, OTP_POLICY.maxAttempts - attemptsSoFar);
}
