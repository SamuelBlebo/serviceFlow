import type { Capability } from "@serviceflow/shared";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { useAuth } from "./AuthProvider";

/**
 * Route guards. UX ONLY — they decide what to render and where to redirect.
 * Real enforcement is server-side: Security Rules and callable guards.
 */
export function RequireAuth({ children, loginPath = "/login" }: { children: ReactNode; loginPath?: string }) {
  const { session } = useAuth();
  const location = useLocation();

  if (session.status === "loading") return <FullPageSpinner />;
  if (session.status === "signedOut") {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${loginPath}?next=${next}`} replace />;
  }
  return <>{children}</>;
}

export function RequireCapability({ capability, children }: { capability: Capability; children: ReactNode }) {
  const { session } = useAuth();
  if (session.status !== "signedIn") return null; // RequireAuth handles the other states
  if (!session.capabilities[capability]) return <NoAccess capability={capability} />;
  return <>{children}</>;
}

function NoAccess({ capability }: { capability: Capability }) {
  const what = capability === "admin" ? "ServiceFlow administrators" : "verified service providers";
  return (
    <div role="alert" className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">You don't have access to this area</h1>
      <p className="mt-3 text-ink-600">This area is only for {what}.</p>
      <Link to="/app" className="mt-6 inline-block font-medium text-brand-700 hover:text-brand-800">
        Go to your dashboard
      </Link>
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" aria-busy="true" aria-label="Loading">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
    </div>
  );
}

/** Only allows same-origin relative paths as post-login destinations (no open redirects). */
export function safeNextPath(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}
