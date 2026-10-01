import type { NextFunction, Request, Response } from "express";
import { AppError } from "@serviceflow/shared";
import { logger } from "../../config/logger";

/**
 * Centralized error handler. Every route ultimately funnels errors here via
 * asyncHandler — this is the ONLY place that decides HTTP status/shape for
 * an error response, so behavior stays consistent across the whole API.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.httpStatus >= 500) {
      logger.error({ err, path: req.path }, err.message);
    }
    res.status(err.httpStatus).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}
