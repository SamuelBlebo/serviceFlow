/**
 * Shared helpers for emulator-backed integration tests (`*.int.test.ts`).
 * `firebase emulators:exec` sets FIRESTORE_EMULATOR_HOST and
 * FIREBASE_AUTH_EMULATOR_HOST; the Admin SDK then talks only to the emulators.
 */
import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const PROJECT_ID = "demo-serviceflow";

export function assertEmulators(): void {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Integration tests must run under the emulators: use `pnpm test:integration` from the repo root.");
  }
}

export function adminClients() {
  assertEmulators();
  const app = getApps().find((a) => a.name === "integration") ?? initializeApp({ projectId: PROJECT_ID }, "integration");
  return { app, auth: getAuth(app), db: getFirestore(app) };
}

/** Wipes all Firestore data and Auth users in the emulators between tests. */
export async function resetEmulators(): Promise<void> {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const headers = { Authorization: "Bearer owner" };
  await fetch(`http://${firestoreHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: "DELETE",
    headers,
  });
  await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE", headers });
}

export async function closeAdminClients(): Promise<void> {
  await Promise.all(getApps().map((a) => deleteApp(a)));
}

/** A controllable clock for OTP expiry / cooldown tests. */
export function testClock(start = Date.UTC(2026, 9, 1, 9, 0, 0)) {
  let nowMs = start;
  return {
    now: () => new Date(nowMs),
    advanceSeconds: (s: number) => {
      nowMs += s * 1000;
    },
  };
}
