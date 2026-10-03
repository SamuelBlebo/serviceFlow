import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { EMULATOR_HOST, firebaseApp, usingEmulators } from "./app";

let instance: FirebaseStorage | null = null;

/** Used from the Technician onboarding stage onwards. */
export function storage(): FirebaseStorage {
  if (instance) return instance;
  instance = getStorage(firebaseApp());
  if (usingEmulators()) connectStorageEmulator(instance, EMULATOR_HOST, 9199);
  return instance;
}
