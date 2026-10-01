import { NavLink, Outlet } from "react-router";
import { Logo } from "../../components/Logo";
import { useAuth } from "../../lib/auth/AuthProvider";
import { usingEmulators as readUsingEmulators } from "../../lib/firebase/app";

const NAV = [
  { to: "/services", label: "Services" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/become-a-provider", label: "Become a provider" },
  { to: "/about", label: "About" },
];

export function PublicLayout() {
  const { session } = useAuth();
  const account =
    session.status === "signedIn"
      ? { to: session.capabilities.admin ? "/admin" : session.capabilities.tech ? "/tech" : "/app", label: "Dashboard" }
      : { to: "/login", label: "Sign in" };
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50">
        Skip to content
      </a>
      <header className="border-b border-ink-100">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `text-sm ${isActive ? "font-medium text-ink-900" : "text-ink-600 hover:text-ink-900"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <NavLink
            to={account.to}
            className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-900 hover:border-ink-300"
          >
            {account.label}
          </NavLink>
        </div>
        <nav aria-label="Main (mobile)" className="flex gap-5 overflow-x-auto px-4 pb-3 md:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `whitespace-nowrap text-sm ${isActive ? "font-medium text-ink-900" : "text-ink-600"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-ink-100 bg-ink-50">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-ink-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} ServiceFlow. Made in Accra.</p>
          <div className="flex items-center gap-6">
            <NavLink to="/contact" className="hover:text-ink-900">
              Contact
            </NavLink>
            <EnvironmentBadge />
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Makes it obvious when the app is talking to local emulators, never production. */
function EnvironmentBadge() {
  let usingEmulators = false;
  try {
    usingEmulators = readUsingEmulators();
  } catch {
    return null;
  }
  if (!usingEmulators) return null;
  return (
    <span className="rounded-full bg-accent-400/20 px-2.5 py-1 text-xs font-medium text-accent-600">
      Local emulators
    </span>
  );
}
