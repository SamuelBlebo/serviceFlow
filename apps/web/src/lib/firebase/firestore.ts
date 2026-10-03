import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { EMULATOR_HOST, firebaseApp, usingEmulators } from "./app";

let instance: Firestore | null = null;

export function db(): Firestore {
  if (instance) return instance;
  instance = getFirestore(firebaseApp());
  if (usingEmulators()) connectFirestoreEmulator(instance, EMULATOR_HOST, 8080);
  return instance;
}
