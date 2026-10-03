import { describe, expect, it } from "vitest";
import { messageFromError } from "./errors";

const fbError = (code: string, message: string, details?: unknown) => Object.assign(new Error(message), { code, details });

describe("messageFromError", () => {
  it("shows the first field message for validation errors instead of 'Invalid request'", () => {
    const err = fbError("functions/invalid-argument", "Invalid request", {
      code: "VALIDATION_ERROR",
      details: [{ path: "priceRange", message: "The lowest price can't be more than the highest price" }],
    });
    expect(messageFromError(err)).toBe("The lowest price can't be more than the highest price");
  });

  it("keeps domain messages and hides internal ones", () => {
    expect(messageFromError(fbError("functions/already-exists", "Another service is already called \"Carpentry\"."))).toMatch(/already called/);
    expect(messageFromError(fbError("functions/internal", "stack trace here"))).toBe("Something went wrong. Please try again.");
  });

  it("explains connection problems", () => {
    expect(messageFromError(fbError("functions/unavailable", "fetch failed"))).toMatch(/couldn't reach ServiceFlow/);
  });
});
