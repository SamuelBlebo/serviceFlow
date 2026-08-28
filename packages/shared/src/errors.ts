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
