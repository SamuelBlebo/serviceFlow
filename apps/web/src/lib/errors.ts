/**
 * Turns errors from callables / Firebase Auth into a message a person can act
 * on. Callable errors already carry a user-facing message from the server
 * (domain errors keep theirs; unexpected ones are generic).
 */
export function messageFromError(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  const code = e?.code ?? "";

  if (code === "functions/unavailable" || code === "auth/network-request-failed" || code === "functions/deadline-exceeded") {
    return "We couldn't reach ServiceFlow. Check your connection and try again.";
  }
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Incorrect email or password.";
  }
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a moment and try again.";
  if (code === "auth/user-disabled") return "This account has been suspended. Contact ServiceFlow support.";
  // Validation errors carry per-field messages from the shared schemas; show the first one.
  if (code === "functions/invalid-argument") {
    const fields = (e as { details?: { details?: Array<{ message?: string }> } } | null)?.details?.details;
    if (fields?.[0]?.message) return fields[0].message;
  }
  if (code.startsWith("functions/") && e?.message && code !== "functions/internal") return e.message;
  return "Something went wrong. Please try again.";
}
