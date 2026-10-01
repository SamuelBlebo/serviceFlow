/**
 * Authentication policy shared by Cloud Functions (enforcement) and the
 * web/mobile apps (countdowns, input hints). The OTP rules preserve the
 * legacy backend's: 6 digits, 5-minute expiry, 5 attempts per code.
 *
 * Decision D2: phone sign-in uses ServiceFlow's own OTP (sent by an
 * OtpSender — mock now, SMS/WhatsApp later) exchanged for a Firebase custom
 * token, so web and mobile share exactly one flow.
 */
export const OTP_POLICY = {
  codeLength: 6,
  ttlSeconds: 300,
  maxAttempts: 5,
  /** Minimum wait between two codes for the same phone. */
  resendCooldownSeconds: 30,
  /** At most this many codes per phone per window. */
  maxSendsPerWindow: 3,
  sendWindowSeconds: 600,
  /** At most this many OTP requests per client IP per hour (anti SMS-bombing). */
  maxRequestsPerIpPerHour: 20,
} as const;

/**
 * Capability custom claims — set ONLY by Cloud Functions. Every signed-in
 * user is a customer; `tech` and `admin` are additional capabilities.
 */
export type Capability = "tech" | "admin";

export interface Capabilities {
  tech: boolean;
  admin: boolean;
}

/** Reads capabilities from decoded token claims. Only a literal `true` counts. */
export function capabilitiesFromClaims(claims: Record<string, unknown> | null | undefined): Capabilities {
  return { tech: claims?.tech === true, admin: claims?.admin === true };
}

/** Admin actions that change money, roles or account status require a sign-in this recent. */
export const RECENT_SIGN_IN_SECONDS = 15 * 60;

/** Admin web sessions sign out after this much inactivity. */
export const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
