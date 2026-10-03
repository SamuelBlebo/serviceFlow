import { paths } from "@serviceflow/firebase";
import {
  OTP_POLICY,
  RateLimitedError,
  type RequestOtpOutput,
  UnauthorizedError,
  ValidationError,
  type VerifyOtpOutput,
  normalizeGhanaPhone,
} from "@serviceflow/shared";
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore, Timestamp } from "firebase-admin/firestore";
import type { OtpSender } from "../../integrations/otp/otp-sender";
import { type RateLimitState, decideRateLimit, ipRateLimitKey } from "../../lib/rate-limit";
import { ensureActiveUserDoc, findOrCreateUserByPhone } from "./accounts";
import { generateOtpCode, hashOtpCode, verifyOtpCode } from "./otp-crypto";
import { type OtpChallengeState, attemptsRemaining, decideSend, decideVerify } from "./otp-policy";

/**
 * Phone sign-in (Decision D2): request a code, then exchange a correct code
 * for a Firebase custom token. One active challenge per phone lives at
 * `otpChallenges/{e164}` — server-only, never readable by clients.
 */
export interface OtpDeps {
  db: Firestore;
  auth: Auth;
  sender: OtpSender;
  now?: () => Date;
  /** Emulator only: return the code to the client so developers can sign in without SMS. */
  exposeDevCode?: boolean;
}

interface ChallengeDoc {
  codeHash: string;
  salt: string;
  expiresAt: Timestamp;
  attempts: number;
  lastSentAt: Timestamp;
  windowStart: Timestamp;
  sendsInWindow: number;
}

function toState(doc: ChallengeDoc): OtpChallengeState {
  return {
    expiresAtMs: doc.expiresAt.toMillis(),
    attempts: doc.attempts,
    lastSentAtMs: doc.lastSentAt.toMillis(),
    windowStartMs: doc.windowStart.toMillis(),
    sendsInWindow: doc.sendsInWindow,
  };
}

function e164OrThrow(rawPhone: string): string {
  const e164 = normalizeGhanaPhone(rawPhone);
  if (!e164) throw new ValidationError("Enter a valid Ghanaian phone number");
  return e164;
}

export async function requestOtp(deps: OtpDeps, input: { phone: string; ip: string }): Promise<RequestOtpOutput> {
  const e164 = e164OrThrow(input.phone);
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  const code = generateOtpCode();
  const { hash, salt } = await hashOtpCode(code);

  const challengeRef = deps.db.doc(paths.otpChallenge(e164));
  const ipRef = deps.db.doc(paths.rateLimit(ipRateLimitKey("otp", input.ip)));

  await deps.db.runTransaction(async (tx) => {
    const [challengeSnap, ipSnap] = await Promise.all([tx.get(challengeRef), tx.get(ipRef)]);

    const ipState = ipSnap.exists
      ? { windowStartMs: (ipSnap.get("windowStart") as Timestamp).toMillis(), count: ipSnap.get("count") as number }
      : null;
    const ipDecision = decideRateLimit(ipState, OTP_POLICY.maxRequestsPerIpPerHour, 3600, nowMs);
    if (!ipDecision.allowed) {
      throw new RateLimitedError(`Too many code requests from this network. Try again in ${ipDecision.retryAfterSeconds} seconds.`);
    }

    const existing = challengeSnap.exists ? toState(challengeSnap.data() as ChallengeDoc) : null;
    const send = decideSend(existing, nowMs);
    if (!send.allowed) {
      throw new RateLimitedError(`Please wait ${send.retryAfterSeconds} seconds before requesting another code.`);
    }

    const next: RateLimitState = ipDecision.next;
    tx.set(ipRef, { windowStart: Timestamp.fromMillis(next.windowStartMs), count: next.count });
    tx.set(challengeRef, {
      codeHash: hash,
      salt,
      expiresAt: Timestamp.fromMillis(nowMs + OTP_POLICY.ttlSeconds * 1000),
      attempts: 0,
      lastSentAt: Timestamp.fromMillis(nowMs),
      windowStart: Timestamp.fromMillis(send.windowStartMs),
      sendsInWindow: send.sendsInWindow,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await deps.sender.send({ phone: e164, code, expiresInSeconds: OTP_POLICY.ttlSeconds });

  return {
    ok: true,
    phone: e164,
    expiresInSeconds: OTP_POLICY.ttlSeconds,
    resendInSeconds: OTP_POLICY.resendCooldownSeconds,
    ...(deps.exposeDevCode ? { devCode: code } : {}),
  };
}

type CheckResult = { outcome: "ok" } | { outcome: "wrong"; remaining: number } | { outcome: "missing" | "expired" | "locked" };

export async function verifyOtp(deps: OtpDeps, input: { phone: string; code: string }): Promise<VerifyOtpOutput> {
  const e164 = e164OrThrow(input.phone);
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  const challengeRef = deps.db.doc(paths.otpChallenge(e164));

  // The transaction returns an outcome instead of throwing, so a wrong
  // guess's attempt counter is committed rather than rolled back.
  const result = await deps.db.runTransaction<CheckResult>(async (tx) => {
    const snap = await tx.get(challengeRef);
    const doc = snap.exists ? (snap.data() as ChallengeDoc) : null;
    const decision = decideVerify(doc ? toState(doc) : null, nowMs);

    if (decision === "expired") {
      tx.delete(challengeRef);
      return { outcome: "expired" };
    }
    if (decision !== "check" || !doc) return { outcome: decision === "check" ? "missing" : decision };

    if (await verifyOtpCode(input.code, doc.codeHash, doc.salt)) {
      tx.delete(challengeRef); // single use
      return { outcome: "ok" };
    }
    tx.update(challengeRef, { attempts: FieldValue.increment(1) });
    return { outcome: "wrong", remaining: attemptsRemaining(doc.attempts + 1) };
  });

  switch (result.outcome) {
    case "missing":
      throw new ValidationError("No active code for this number. Request a new one.");
    case "expired":
      throw new ValidationError("This code has expired. Request a new one.");
    case "locked":
      throw new UnauthorizedError("Too many incorrect attempts. Request a new code.");
    case "wrong":
      throw new ValidationError(
        result.remaining > 0
          ? `Incorrect code. ${result.remaining} attempt${result.remaining === 1 ? "" : "s"} left.`
          : "Incorrect code. Request a new one.",
        { attemptsRemaining: result.remaining },
      );
    case "ok":
      break;
  }

  const { user, isNew } = await findOrCreateUserByPhone(deps.auth, e164);
  await ensureActiveUserDoc(deps.db, user, e164);
  const token = await deps.auth.createCustomToken(user.uid);
  return { token, isNewUser: isNew };
}
