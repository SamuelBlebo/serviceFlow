import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { vi } from "vitest";
import type { Service } from "../lib/admin/catalogue-store";
import { AuthContext } from "../lib/auth/AuthProvider";
import type { ServiceArea } from "../lib/profile/customer-store";
import { TechnicianContext, type TechnicianState } from "../lib/technician/TechnicianProvider";
import type { Technician, TechnicianStore, Verification } from "../lib/technician/technician-store";
import { fakeActions, signedIn } from "./auth";

const ts = { toMillis: () => 0 };

export const SERVICES: Service[] = [
  { id: "plumbing", name: "Plumbing", slug: "plumbing", description: "", iconPath: null, priceRange: { minMinor: 1, maxMinor: 2 }, isActive: true, sortOrder: 1 },
  { id: "electrical", name: "Electrical", slug: "electrical", description: "", iconPath: null, priceRange: { minMinor: 1, maxMinor: 2 }, isActive: true, sortOrder: 2 },
];

export const AREAS: ServiceArea[] = [
  { id: "osu", name: "Osu", city: "Accra", region: "Greater Accra", country: "GH", center: { lat: 5.55, lng: -0.17 }, defaultRadiusKm: 8, isActive: true },
  { id: "madina", name: "Madina", city: "Accra", region: "Greater Accra", country: "GH", center: { lat: 5.68, lng: -0.16 }, defaultRadiusKm: 8, isActive: true },
];

export function technician(overrides: Partial<Technician> = {}): Technician {
  return {
    id: "u1",
    displayName: "Kwame Owusu",
    photoPath: null,
    bio: "",
    yearsExperience: 5,
    serviceIds: [],
    serviceAreas: [],
    weeklyAvailability: [1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "08:00", end: "18:00" })),
    isOnline: false,
    verificationStatus: "UNSUBMITTED",
    latestVerificationId: null,
    stats: { ratingSum: 0, ratingCount: 0, avgRating: 0, completed: 0, cancelled: 0, offered: 0, responded: 0 },
    activeBookingId: null,
    createdAt: ts,
    ...overrides,
  };
}

export function verification(overrides: Partial<Verification> = {}): Verification {
  return {
    id: "u1_sub1",
    technicianId: "u1",
    idType: "GHANA_CARD",
    idNumber: "GHA-123456789-0",
    idPhotoPath: "verifications/u1/sub1/id.jpg",
    selfiePath: "verifications/u1/sub1/selfie.jpg",
    status: "PENDING",
    reviewNotes: null,
    reviewedBy: null,
    submittedAt: ts,
    reviewedAt: null,
    ...overrides,
  };
}

export const withWork = { serviceIds: ["plumbing"], serviceAreas: [{ areaId: "osu", name: "Osu", lat: 5.55, lng: -0.17, radiusKm: 8 }] };

export function readyTechnician(t: Technician = technician(), verifications: Verification[] = []): TechnicianState {
  return { status: "ready", uid: "u1", technician: t, verifications, services: SERVICES, areas: AREAS };
}

/** Fresh fake store per call — every operation resolves unless overridden. */
export function fakeTechnicianStore(overrides: Partial<TechnicianStore> = {}): TechnicianStore {
  return {
    register: vi.fn(async () => ({ ok: true as const, id: "u1" })),
    updateServices: vi.fn(async () => ({ ok: true as const, id: "u1" })),
    submitVerification: vi.fn(async () => ({ ok: true as const, id: "u1_sub1" })),
    updateProfile: vi.fn(async () => undefined),
    setOnline: vi.fn(async () => undefined),
    review: vi.fn(async () => ({ ok: true as const, id: "u1" })),
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

export function renderWithTechnician(
  element: ReactElement,
  opts: { state?: TechnicianState; store?: TechnicianStore; path?: string; actions?: ReturnType<typeof fakeActions> } = {},
) {
  const store = opts.store ?? fakeTechnicianStore();
  const actions = opts.actions ?? fakeActions();
  const path = opts.path ?? "/tech";
  const utils = render(
    <AuthContext.Provider value={{ session: signedIn({ tech: true }), actions }}>
      <TechnicianContext.Provider value={{ state: opts.state ?? readyTechnician(), store }}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={path} element={element} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </TechnicianContext.Provider>
    </AuthContext.Provider>,
  );
  return { ...utils, store, actions };
}
