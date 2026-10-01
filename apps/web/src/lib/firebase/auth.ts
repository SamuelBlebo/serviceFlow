import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { EMULATOR_HOST, firebaseApp, usingEmulators } from "./app";

let instance: Auth | null = null;

/** Used from the Authentication stage onwards. */
export function auth(): Auth {
  if (instance) return instance;
  instance = getAuth(firebaseApp());
  if (usingEmulators()) connectAuthEmulator(instance, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  return instance;
}
