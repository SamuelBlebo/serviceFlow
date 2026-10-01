import { type Capabilities, capabilitiesFromClaims } from "@serviceflow/shared";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  onIdTokenChanged,
  setPersistence,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "../firebase/auth";

/**
 * Thin wrapper over the Firebase Auth SDK. Loaded with a dynamic import by
 * AuthProvider, so the Auth SDK downloads after the public page shell.
 */
export interface SessionUser {
  uid: string;
  phone: string | null;
  email: string | null;
  displayName: string | null;
}

export interface SignedInSession {
  user: SessionUser;
  capabilities: Capabilities;
}

/** Customers/technicians stay signed in on their device; admin sessions end with the browser tab. */
export type PersistenceMode = "device" | "tab";

export function subscribe(onChange: (session: SignedInSession | null) => void): () => void {
  return onIdTokenChanged(auth(), async (user) => {
    if (!user) {
      onChange(null);
      return;
    }
    const token = await user.getIdTokenResult();
    onChange({
      user: { uid: user.uid, phone: user.phoneNumber, email: user.email, displayName: user.displayName },
      capabilities: capabilitiesFromClaims(token.claims),
    });
  });
}

async function applyPersistence(mode: PersistenceMode) {
  await setPersistence(auth(), mode === "tab" ? browserSessionPersistence : browserLocalPersistence);
}

/** Completes phone sign-in with the custom token returned by `auth-verifyOtp`. */
export async function signInWithToken(token: string): Promise<void> {
  await applyPersistence("device");
  await signInWithCustomToken(auth(), token);
}

/** Admin email/password sign-in. Returns the capabilities from the fresh token. */
export async function signInAdmin(email: string, password: string): Promise<Capabilities> {
  await applyPersistence("tab");
  const credential = await signInWithEmailAndPassword(auth(), email, password);
  const token = await credential.user.getIdTokenResult(true);
  return capabilitiesFromClaims(token.claims);
}

export async function signOutUser(): Promise<void> {
  await signOut(auth());
}
