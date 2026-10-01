/**
 * Typed application errors. Route handlers catch these and map `httpStatus`
 * to the response — business/service code should never throw bare Error or
 * reach into Express directly.
 */
export class AppError extends Error {
  readonly httpStatus: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, opts: { httpStatus?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = "AppError";
    this.httpStatus = opts.httpStatus ?? 500;
    this.code = opts.code ?? "INTERNAL_ERROR";
    this.details = opts.details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { httpStatus: 400, code: "VALIDATION_ERROR", details });
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} not found: ${id}` : `${resource} not found`, {
      httpStatus: 404,
      code: "NOT_FOUND",
    });
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, { httpStatus: 401, code: "UNAUTHORIZED" });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, { httpStatus: 403, code: "FORBIDDEN" });
    this.name = "ForbiddenError";
  }
}

/** Thrown when a booking (or similar) state transition is not allowed. */
export class InvalidStateTransitionError extends AppError {
  constructor(entity: string, from: string, to: string) {
    super(`Invalid ${entity} transition: ${from} -> ${to}`, {
      httpStatus: 409,
      code: "INVALID_STATE_TRANSITION",
      details: { from, to },
    });
    this.name = "InvalidStateTransitionError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, { httpStatus: 409, code: "CONFLICT" });
    this.name = "ConflictError";
  }
}

/**
 * Firebase callable error codes (a subset of `FunctionsErrorCode`), declared
 * here structurally so this package never imports a Firebase SDK. Cloud
 * Functions map every AppError through this before throwing an HttpsError,
 * so web and mobile receive one consistent error vocabulary.
 */
export type CallableErrorCode =
  | "invalid-argument"
  | "not-found"
  | "unauthenticated"
  | "permission-denied"
  | "failed-precondition"
  | "already-exists"
  | "resource-exhausted"
  | "internal";

const CODE_MAP: Record<string, CallableErrorCode> = {
  VALIDATION_ERROR: "invalid-argument",
  NOT_FOUND: "not-found",
  UNAUTHORIZED: "unauthenticated",
  REAUTH_REQUIRED: "unauthenticated",
  FORBIDDEN: "permission-denied",
  INVALID_STATE_TRANSITION: "failed-precondition",
  CONFLICT: "already-exists",
  RATE_LIMITED: "resource-exhausted",
  INTERNAL_ERROR: "internal",
};

export function toCallableErrorCode(err: unknown): CallableErrorCode {
  if (err instanceof AppError) return CODE_MAP[err.code] ?? "internal";
  return "internal";
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests — please wait and try again") {
    super(message, { httpStatus: 429, code: "RATE_LIMITED" });
    this.name = "RateLimitedError";
  }
}

/**
 * The action needs a fresh sign-in (e.g. sensitive admin actions older than
 * RECENT_SIGN_IN_SECONDS). Clients detect `details.code === "REAUTH_REQUIRED"`
 * and prompt the user to sign in again.
 */
export class ReauthenticationRequiredError extends AppError {
  constructor(message = "Please sign in again to continue") {
    super(message, { httpStatus: 401, code: "REAUTH_REQUIRED" });
    this.name = "ReauthenticationRequiredError";
  }
}
