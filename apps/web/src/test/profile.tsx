import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { vi } from "vitest";
import { AuthContext } from "../lib/auth/AuthProvider";
import { CustomerProfileContext, type CustomerProfileState } from "../lib/profile/CustomerProfileProvider";
import type { Address, Customer, CustomerStore, ServiceArea } from "../lib/profile/customer-store";
import { fakeActions, signedIn } from "./auth";

const ts = { toMillis: () => 0 };

export const AREAS: ServiceArea[] = [
  { id: "east-legon", name: "East Legon", city: "Accra", region: "Greater Accra", country: "GH", center: { lat: 5.6494, lng: -0.1531 }, defaultRadiusKm: 8, isActive: true },
  { id: "osu", name: "Osu", city: "Accra", region: "Greater Accra", country: "GH", center: { lat: 5.5558, lng: -0.1793 }, defaultRadiusKm: 8, isActive: true },
];

export function customer(overrides: Partial<Customer> = {}): Customer {
  return { id: "u1", fullName: "Ama Serwaa", defaultAddressId: "home", createdAt: ts, updatedAt: ts, ...overrides };
}

export function address(id: string, overrides: Partial<Address> = {}): Address {
  return {
    id,
    label: id === "home" ? "Home" : id,
    directions: "Opposite the Shell station, blue gate",
    ghanaPostGps: null,
    areaId: "east-legon",
    areaName: "East Legon",
    location: { lat: 5.6494, lng: -0.1531 },
    notes: null,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

export function readyState(overrides: Partial<Extract<CustomerProfileState, { status: "ready" }>> = {}): CustomerProfileState {
  return { status: "ready", uid: "u1", customer: customer(), addresses: [address("home")], areas: AREAS, ...overrides };
}

/** A fresh fake store per call: every operation resolves unless overridden. */
export function fakeStore(overrides: Partial<CustomerStore> = {}): CustomerStore {
  return {
    createCustomerProfile: vi.fn(async () => undefined),
    updateCustomerName: vi.fn(async () => undefined),
    saveAddress: vi.fn(async () => "new-id"),
    setDefaultAddress: vi.fn(async () => undefined),
    deleteAddress: vi.fn(async () => undefined),
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

export function renderWithProfile(
  element: ReactElement,
  opts: {
    state?: CustomerProfileState;
    store?: CustomerStore;
    path?: string;
    routerState?: unknown;
    actions?: ReturnType<typeof fakeActions>;
  } = {},
) {
  const store = opts.store ?? fakeStore();
  const path = opts.path ?? "/app";
  const utils = render(
    <AuthContext.Provider value={{ session: signedIn(), actions: opts.actions ?? fakeActions() }}>
      <CustomerProfileContext.Provider value={{ state: opts.state ?? readyState(), store }}>
        <MemoryRouter initialEntries={[{ pathname: path, state: opts.routerState }]}>
          <Routes>
            <Route path={path} element={element} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </CustomerProfileContext.Provider>
    </AuthContext.Provider>,
  );
  return { ...utils, store };
}
