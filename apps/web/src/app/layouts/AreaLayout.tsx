import { ADMIN_IDLE_TIMEOUT_MS, formatGhanaPhoneForDisplay } from "@serviceflow/shared";
import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { Logo } from "../../components/Logo";
import { useAuth } from "../../lib/auth/AuthProvider";

export interface AreaNavItem {
  to: string;
  label: string;
}

/**
 * Shell shared by the signed-in areas (customer /app, technician /tech,
 * admin /admin). Each area passes its own navigation. Access is checked by
 * the route guards for UX; Security Rules and callables enforce it.
 */
export function AreaLayout({ areaName, nav, idleTimeoutMs }: { areaName: string; nav: AreaNavItem[]; idleTimeoutMs?: number }) {
  const { session, actions } = useAuth();
  const navigate = useNavigate();
  useIdleSignOut(idleTimeoutMs);

  const who =
    session.status === "signedIn"
      ? session.user.phone
        ? formatGhanaPhoneForDisplay(session.user.phone)
        : (session.user.email ?? "Signed in")
      : null;

  async function signOut() {
    // Leave the guarded area first; otherwise the guard reacts to the session
    // ending and redirects to the login page before we reach the home page.
    navigate("/", { replace: true });
    await actions.signOut();
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex flex-col border-b border-ink-100 bg-ink-50 md:w-60 md:border-b-0 md:border-r">
        <div className="flex h-16 items-center px-4">
          <Logo />
        </div>
        <p className="px-4 pb-2 text-xs font-medium uppercase tracking-wide text-ink-500">{areaName}</p>
        <nav aria-label={`${areaName} navigation`} className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
                  isActive ? "bg-white font-medium text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {who && (
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-ink-100 px-4 py-3 md:block">
            <p className="truncate text-sm text-ink-700" title={who}>
              {who}
            </p>
            <button type="button" onClick={signOut} className="text-sm font-medium text-brand-700 hover:text-brand-800 md:mt-1">
              Sign out
            </button>
          </div>
        )}
      </aside>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

/** Signs the user out after a period without interaction (admin sessions). */
function useIdleSignOut(timeoutMs: number | undefined) {
  const { actions } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!timeoutMs) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await actions.signOut();
        navigate("/admin/login?reason=idle", { replace: true });
      }, timeoutMs);
    };
    const events = ["mousemove", "keydown", "pointerdown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [timeoutMs, actions, navigate]);
}

export const ADMIN_AREA_IDLE_TIMEOUT_MS = ADMIN_IDLE_TIMEOUT_MS;
