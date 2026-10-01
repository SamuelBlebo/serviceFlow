import { httpsCallable } from "@react-native-firebase/functions";
import { type CallableInput, type CallableKey, type CallableOutput, callables } from "@serviceflow/firebase";
import { functions } from "./firebase";

/**
 * Typed callable invocation through the shared contract: the same names and
 * payload types the web app uses, so the two clients can't drift.
 */
export async function call<K extends CallableKey>(key: K, input: CallableInput<K>): Promise<CallableOutput<K>> {
  const fn = httpsCallable<CallableInput<K>, CallableOutput<K>>(functions(), callables[key].name);
  const result = await fn(input);
  return result.data;
}

/** User-facing message for a failed callable or auth call. */
export function messageFromError(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  const code = e?.code ?? "";
  if (code.includes("unavailable") || code.includes("network-request-failed") || code.includes("deadline-exceeded")) {
    return "No connection. Check your data or Wi-Fi and try again.";
  }
  if (code.includes("user-disabled")) return "This account has been suspended. Contact ServiceFlow support.";
  if (e?.message && !code.includes("internal")) return e.message;
  return "Something went wrong. Please try again.";
}
