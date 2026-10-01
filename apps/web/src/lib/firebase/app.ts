import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { readEnv } from "../env";

/**
 * The web app's Firebase app instance. Each Firebase service lives in its own
 * module (firestore.ts, auth.ts, functions.ts, storage.ts) so a page only
 * downloads the SDK parts it actually uses — this matters on Ghanaian mobile
 * data. In development everything connects to the local Emulator Suite.
 */
export const EMULATOR_HOST = "127.0.0.1";

export function firebaseApp(): FirebaseApp {
  const existing = getApps()[0];
  if (existing) return existing;
  const env = readEnv();
  return initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    appId: env.VITE_FIREBASE_APP_ID,
  });
}

export function usingEmulators(): boolean {
  return readEnv().VITE_USE_EMULATORS;
}
