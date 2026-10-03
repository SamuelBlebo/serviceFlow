import { paths } from "@serviceflow/firebase";
import {
  type Capabilities,
  type Capability,
  ForbiddenError,
  RECENT_SIGN_IN_SECONDS,
  ReauthenticationRequiredError,
  UnauthorizedError,
  UserStatus,
  ValidationError,
  capabilitiesFromClaims,
} from "@serviceflow/shared";
import type { Firestore } from "firebase-admin/firestore";
import type { z } from "zod";

/**
 * Callable guards — the Firebase replacement for the legacy Express
 * `authenticate` / `requireRole` middleware. Identity and capabilities come
 * ONLY from the verified ID token (`request.auth`), never from the payload.
 *
 * Capabilities are custom claims set exclusively by Cloud Functions:
 *   { tech?: true, admin?: true }   — every signed-in user is a customer.
 */
export type { Capability };

/** The subset of a v2 CallableRequest the guards need (keeps them unit-testable). */
export interface GuardableRequest {
  auth?: { uid: string; token: Record<string, unknown> } | undefined;
}

export interface AuthContext {
  uid: string;
  capabilities: Capabilities;
}

export function requireAuth(request: GuardableRequest): AuthContext {
  const auth = request.auth;
  if (!auth?.uid) {
    throw new UnauthorizedError("Sign in to continue");
  }
  return { uid: auth.uid, capabilities: capabilitiesFromClaims(auth.token) };
}

export function requireCapability(request: GuardableRequest, capability: Capability): AuthContext {
  const ctx = requireAuth(request);
  if (!ctx.capabilities[capability]) {
    throw new ForbiddenError(`This action requires the ${capability} capability`);
  }
  return ctx;
}

/**
 * Rejects callers whose account is suspended (or has no account record).
 * ID tokens stay valid for up to an hour after a suspension; this per-call
 * check makes the suspension effective immediately (fixes legacy D-10).
 */
export async function requireActiveUser(request: GuardableRequest, db: Firestore): Promise<AuthContext> {
  const ctx = requireAuth(request);
  const snap = await db.doc(paths.user(ctx.uid)).get();
  if (!snap.exists) throw new ForbiddenError("Account not found");
  if (snap.get("status") !== UserStatus.ACTIVE) {
    throw new ForbiddenError("This account has been suspended. Contact ServiceFlow support.");
  }
  return ctx;
}

/** Sensitive admin actions require a sign-in within the last RECENT_SIGN_IN_SECONDS. */
export function requireRecentSignIn(
  request: GuardableRequest,
  nowMs: number = Date.now(),
  maxAgeSeconds: number = RECENT_SIGN_IN_SECONDS,
): void {
  const authTime = request.auth?.token.auth_time;
  if (typeof authTime !== "number" || nowMs - authTime * 1000 > maxAgeSeconds * 1000) {
    throw new ReauthenticationRequiredError();
  }
}

/** Validates callable input with the shared schema; the error lists the offending fields. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const fields = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    throw new ValidationError("Invalid request", fields);
  }
  return result.data;
}
