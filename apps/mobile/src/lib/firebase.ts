import { connectFirestoreEmulator, getFirestore, type Firestore } from "@react-native-firebase/firestore";
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

export function emulatorHost(): string {
  const configured = process.env.EXPO_PUBLIC_EMULATOR_HOST?.trim();
  if (configured) return configured;
  return Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1";
}

let instance: Firestore | null = null;

export function db(): Firestore {
  if (instance) return instance;
  instance = getFirestore();
  if (USE_EMULATORS) connectFirestoreEmulator(instance, emulatorHost(), 8080);
  return instance;
}
