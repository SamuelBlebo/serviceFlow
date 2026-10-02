import type { Capabilities } from "@serviceflow/shared";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "./firebase-session";

export type SessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: SessionUser; capabilities: Capabilities };

export interface AuthActions {
  signInWithToken(token: string): Promise<void>;
  signInAdmin(email: string, password: string): Promise<Capabilities>;
  signOut(): Promise<void>;
  /** Re-reads custom claims (after registering as a provider). */
  refreshSession(): Promise<void>;
}

export interface AuthContextValue {
  session: SessionState;
  actions: AuthActions;
}

/** Exported so tests can provide a session without Firebase. */
export const AuthContext = createContext<AuthContextValue | null>(null);

const loadSession = () => import("./firebase-session");

/**
 * Tracks the signed-in user and their capability claims. Capabilities shown
 * here drive navigation only; Security Rules and Cloud Functions enforce
 * access on the server.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    loadSession()
      .then(({ subscribe }) => {
        if (cancelled) return;
        unsubscribe = subscribe((s) => setSession(s ? { status: "signedIn", ...s } : { status: "signedOut" }));
      })
      .catch((error) => {
        console.error("Could not start authentication", error);
        setSession({ status: "signedOut" });
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const actions = useMemo<AuthActions>(
    () => ({
      signInWithToken: async (token) => (await loadSession()).signInWithToken(token),
      signInAdmin: async (email, password) => (await loadSession()).signInAdmin(email, password),
      signOut: async () => (await loadSession()).signOutUser(),
      refreshSession: async () => (await loadSession()).refreshSession(),
    }),
    [],
  );

  const value = useMemo(() => ({ session, actions }), [session, actions]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
