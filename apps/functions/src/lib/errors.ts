import { AppError, toCallableErrorCode } from "@serviceflow/shared";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Converts anything thrown inside a callable into an HttpsError, so every
 * client receives the same error vocabulary. Known domain errors keep their
 * message; unexpected errors are logged in full and the client only sees a
 * generic message (never stack traces or internal details).
 */
export function toHttpsError(err: unknown): HttpsError {
  if (err instanceof HttpsError) return err;

  if (err instanceof AppError) {
    const code = toCallableErrorCode(err);
    if (code === "internal") logger.error(err.message, { err });
    return new HttpsError(code, err.message, { code: err.code, details: err.details });
  }

  logger.error("Unhandled error in callable", { err });
  return new HttpsError("internal", "Something went wrong. Please try again.");
}

/** Wraps a callable body so thrown domain errors are always mapped consistently. */
export function withErrorMapping<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>) {
  return async (...args: Args): Promise<R> => {
    try {
      return await fn(...args);
    } catch (err) {
      throw toHttpsError(err);
    }
  };
}
