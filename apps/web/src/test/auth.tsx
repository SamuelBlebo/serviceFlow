import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { vi } from "vitest";
import { type AuthActions, AuthContext, type SessionState } from "../lib/auth/AuthProvider";

export const signedOut: SessionState = { status: "signedOut" };

export function signedIn(capabilities: { tech?: boolean; admin?: boolean } = {}): SessionState {
  return {
    status: "signedIn",
    user: { uid: "u1", phone: "+233241234567", email: null, displayName: null },
    capabilities: { tech: Boolean(capabilities.tech), admin: Boolean(capabilities.admin) },
  };
}

export function fakeActions(overrides: Partial<AuthActions> = {}): AuthActions {
  return {
    signInWithToken: vi.fn(async () => undefined),
    signInAdmin: vi.fn(async () => ({ tech: false, admin: true })),
    signOut: vi.fn(async () => undefined),
    ...overrides,
  };
}

/** Shows the current location so tests can assert redirects. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

/**
 * Renders `element` at `path` inside a MemoryRouter with a fake session.
 * Any navigation away lands on the catch-all route, which prints the URL.
 */
export function renderWithAuth(
  element: ReactElement,
  opts: { session?: SessionState; actions?: AuthActions; path?: string; initialEntry?: string | { pathname: string; state?: unknown } } = {},
) {
  const actions = opts.actions ?? fakeActions();
  const path = opts.path ?? "/";
  const utils = render(
    <AuthContext.Provider value={{ session: opts.session ?? signedOut, actions }}>
      <MemoryRouter initialEntries={[opts.initialEntry ?? path]}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { ...utils, actions };
}
