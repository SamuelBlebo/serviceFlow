import { NavLink, Outlet } from "react-router";
import { Logo } from "../../components/Logo";

export interface AreaNavItem {
  to: string;
  label: string;
}

/**
 * Shell shared by the signed-in areas (customer /app, technician /tech,
 * admin /admin). Each area passes its own navigation. Role enforcement is
 * NOT done here — route guards are UX only; Security Rules and callables
 * enforce access on the server.
 */
export function AreaLayout({ areaName, nav }: { areaName: string; nav: AreaNavItem[] }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b border-ink-100 bg-ink-50 md:w-60 md:border-b-0 md:border-r">
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
      </aside>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

/** Stage 2 guard: there is no sign-in yet, so areas show an explicit notice instead of fake auth. */
export function AreaGate({ capability }: { capability: "customer" | "tech" | "admin" }) {
  const who = { customer: "customers", tech: "service providers", admin: "ServiceFlow administrators" }[capability];
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Sign-in required</h1>
      <p className="mt-3 text-ink-600">
        This area is for {who}. Sign-in with your phone number arrives in the Authentication stage; until then this
        area shows its layout only.
      </p>
    </div>
  );
}
