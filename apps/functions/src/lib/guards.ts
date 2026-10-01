import { ForbiddenError, UnauthorizedError, ValidationError } from "@serviceflow/shared";
import type { z } from "zod";

/**
 * Callable guards — the Firebase replacement for the legacy Express
 * `authenticate` / `requireRole` middleware. Identity and capabilities come
 * ONLY from the verified ID token (`request.auth`), never from the payload.
 *
 * Capabilities are custom claims set exclusively by Cloud Functions:
 *   { tech?: true, admin?: true }   — every signed-in user is a customer.
 */
export type Capability = "tech" | "admin";

/** The subset of a v2 CallableRequest the guards need (keeps them unit-testable). */
export interface GuardableRequest {
  auth?: { uid: string; token: Record<string, unknown> } | undefined;
}

export interface AuthContext {
  uid: string;
  capabilities: { tech: boolean; admin: boolean };
}

export function requireAuth(request: GuardableRequest): AuthContext {
  const auth = request.auth;
  if (!auth?.uid) {
    throw new UnauthorizedError("Sign in to continue");
  }
  return {
    uid: auth.uid,
    capabilities: { tech: auth.token.tech === true, admin: auth.token.admin === true },
  };
}

export function requireCapability(request: GuardableRequest, capability: Capability): AuthContext {
  const ctx = requireAuth(request);
  if (!ctx.capabilities[capability]) {
    throw new ForbiddenError(`This action requires the ${capability} capability`);
  }
  return ctx;
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
