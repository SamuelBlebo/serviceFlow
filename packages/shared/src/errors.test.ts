import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
  toCallableErrorCode,
} from "./errors";

describe("toCallableErrorCode", () => {
  it.each([
    [new ValidationError("x"), "invalid-argument"],
    [new NotFoundError("Booking", "b1"), "not-found"],
    [new UnauthorizedError(), "unauthenticated"],
    [new ForbiddenError(), "permission-denied"],
    [new InvalidStateTransitionError("Booking", "REQUESTED", "PAID"), "failed-precondition"],
    [new ConflictError("dup"), "already-exists"],
    [new RateLimitedError(), "resource-exhausted"],
  ])("maps %s", (err, code) => {
    expect(toCallableErrorCode(err)).toBe(code);
  });

  it("never leaks unknown errors as anything but internal", () => {
    expect(toCallableErrorCode(new Error("db exploded"))).toBe("internal");
    expect(toCallableErrorCode("string thrown")).toBe("internal");
  });
});
