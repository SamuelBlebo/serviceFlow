import type { NextFunction, Request, Response } from "express";
import type { Role } from "@serviceflow/database";
import { ForbiddenError, UnauthorizedError } from "@serviceflow/shared";
import { verifyAccessToken } from "../../modules/auth/jwt";

/**
 * Verifies the Bearer JWT and attaches `req.auth = { userId, role }`.
 * Every field on req.auth comes from the signed token, never from the
 * request body/query — this is the single source of truth for "who is
 * calling" that the rest of the app relies on.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing bearer token");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub, role: payload.role };
    next();
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}

/**
 * Role gate. Must run after `authenticate`. This is defense-in-depth on top
 * of per-resource ownership checks done in each service (e.g. a technician
 * passing this gate can still only see their OWN jobs — see bookings.service).
 */
export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      throw new UnauthorizedError();
    }
    if (!allowed.includes(req.auth.role)) {
      throw new ForbiddenError(`Requires one of roles: ${allowed.join(", ")}`);
    }
    next();
  };
}
