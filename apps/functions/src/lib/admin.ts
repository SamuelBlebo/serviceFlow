import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/**
 * Single Admin SDK app per process. The Admin SDK bypasses Security Rules,
 * which is exactly why every privileged write lives in Functions and passes
 * through the shared domain rules first.
 *
 * Under the emulators, FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
 * are set automatically and the SDK talks to them instead of production.
 */
export function adminApp() {
  return getApps()[0] ?? initializeApp();
}

export function db() {
  return getFirestore(adminApp());
}

export function adminAuth() {
  return getAuth(adminApp());
}

/** Default Storage bucket (uploads: profile photos, verification documents). */
export function bucket() {
  return getStorage(adminApp()).bucket();
}
