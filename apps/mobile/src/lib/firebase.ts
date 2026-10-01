import { getApp } from "@react-native-firebase/app";
import { type Auth, connectAuthEmulator, getAuth } from "@react-native-firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "@react-native-firebase/firestore";
import { connectFunctionsEmulator, type Functions, getFunctions } from "@react-native-firebase/functions";
import { Platform } from "react-native";

/**
 * React Native Firebase (Decision D1): native SDKs give us persistent offline
 * Firestore caching, native FCM and App Check — essential for technicians on
 * low-end Android phones with intermittent data. The Firebase project config
 * comes from the native files wired in app.config.ts.
 *
 * In development we connect to the local Emulator Suite. The Android
 * emulator reaches the host machine at 10.0.2.2; a physical phone needs the
 * computer's LAN IP via EXPO_PUBLIC_EMULATOR_HOST.
 */
export const USE_EMULATORS = process.env.EXPO_PUBLIC_USE_EMULATORS === "true";
const FUNCTIONS_REGION = process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || "europe-west1";

export function emulatorHost(): string {
  const configured = process.env.EXPO_PUBLIC_EMULATOR_HOST?.trim();
  if (configured) return configured;
  return Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1";
}

let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let functionsInstance: Functions | null = null;

export function db(): Firestore {
  if (firestoreInstance) return firestoreInstance;
  firestoreInstance = getFirestore();
  if (USE_EMULATORS) connectFirestoreEmulator(firestoreInstance, emulatorHost(), 8080);
  return firestoreInstance;
}

export function auth(): Auth {
  if (authInstance) return authInstance;
  authInstance = getAuth();
  if (USE_EMULATORS) connectAuthEmulator(authInstance, `http://${emulatorHost()}:9099`);
  return authInstance;
}

export function functions(): Functions {
  if (functionsInstance) return functionsInstance;
  functionsInstance = getFunctions(getApp(), FUNCTIONS_REGION);
  if (USE_EMULATORS) connectFunctionsEmulator(functionsInstance, emulatorHost(), 5001);
  return functionsInstance;
}
