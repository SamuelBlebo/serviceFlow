import { onIdTokenChanged, signInWithCustomToken, signOut } from "@react-native-firebase/auth";
import { type Capabilities, capabilitiesFromClaims } from "@serviceflow/shared";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { auth } from "../lib/firebase";

export type SessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; uid: string; phone: string | null; capabilities: Capabilities };

interface AuthContextValue {
  session: SessionState;
  signInWithToken(token: string): Promise<void>;
  signOut(): Promise<void>;
  /** Fetches a fresh ID token so new capability claims (e.g. tech) apply now. */
  refreshSession(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Session state for the mobile app. React Native Firebase persists the
 * session natively, so technicians stay signed in across restarts and while
 * offline. Capabilities drive navigation only; the server enforces access.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: "loading" });

  useEffect(
    () =>
      onIdTokenChanged(auth(), async (user) => {
        if (!user) {
          setSession({ status: "signedOut" });
          return;
        }
        const token = await user.getIdTokenResult();
        setSession({
          status: "signedIn",
          uid: user.uid,
          phone: user.phoneNumber,
          capabilities: capabilitiesFromClaims(token.claims),
        });
      }),
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      signInWithToken: async (token) => {
        await signInWithCustomToken(auth(), token);
      },
      signOut: () => signOut(auth()),
      refreshSession: async () => {
        await auth().currentUser?.getIdToken(true);
      },
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
