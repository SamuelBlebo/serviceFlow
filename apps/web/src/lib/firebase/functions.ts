import type { CallableInput, CallableKey, CallableOutput } from "@serviceflow/firebase";
import { callables } from "@serviceflow/firebase";
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from "firebase/functions";
import { readEnv } from "../env";
import { EMULATOR_HOST, firebaseApp, usingEmulators } from "./app";

let instance: Functions | null = null;

export function functions(): Functions {
  if (instance) return instance;
  instance = getFunctions(firebaseApp(), readEnv().VITE_FIREBASE_FUNCTIONS_REGION);
  if (usingEmulators()) connectFunctionsEmulator(instance, EMULATOR_HOST, 5001);
  return instance;
}

/**
 * Typed callable invocation through the shared contract: the name, input and
 * output types all come from @serviceflow/firebase, so web and mobile can't drift.
 */
export async function call<K extends CallableKey>(key: K, input: CallableInput<K>): Promise<CallableOutput<K>> {
  const fn = httpsCallable<CallableInput<K>, CallableOutput<K>>(functions(), callables[key].name);
  const result = await fn(input);
  return result.data;
}
