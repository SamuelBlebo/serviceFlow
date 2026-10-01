import type { Request } from "express";
import { ValidationError } from "@serviceflow/shared";

/**
 * Reads a route param with a guaranteed non-undefined return type. Express
 * always populates a param declared in the route pattern (e.g. `:id`) when
 * the route matched at all, but the TS types (correctly, under
 * noUncheckedIndexedAccess) don't encode that — this makes the guarantee
 * explicit instead of scattering non-null assertions through controllers,
 * and still fails loudly with a clear 400 in the paranoid case where a
 * route is misconfigured and the param truly is missing.
 */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) {
    throw new ValidationError(`Missing required route parameter: ${name}`);
  }
  return value;
}
