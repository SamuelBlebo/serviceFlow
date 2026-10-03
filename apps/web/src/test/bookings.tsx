import { vi } from "vitest";
import type { Booking, BookingStore, HistoryEntry } from "../lib/bookings/booking-store";

const ts = (ms = Date.UTC(2026, 9, 2, 9, 0)) => ({ toMillis: () => ms });

export function booking(overrides: Partial<Booking> = {}): Booking {
  const { pricing, ...rest } = overrides;
  return {
    id: "bk_1",
    customerId: "u1",
    technicianId: null,
    offeredTechnicianId: null,
    participantIds: ["u1"],
    serviceId: "plumbing",
    serviceSnapshot: { name: "Plumbing" },
    technicianSnapshot: null,
    status: "REQUESTED",
    problemDescription: "Kitchen sink pipe is leaking",
    location: { lat: 5.6494, lng: -0.1531, address: "Home, East Legon", areaId: "east-legon" },
    preferredTime: "ASAP",
    scheduledAt: null,
    pricing: {
      estimateMinMinor: 10000,
      estimateMaxMinor: 30000,
      quotedMinor: null,
      quoteStatus: "NONE",
      quoteNote: null,
      quoteRejectionReason: null,
      priceSetBy: null,
      finalMinor: null,
      commissionPercentSnapshot: null,
      currency: "GHS",
      ...pricing,
    },
    timeline: { requestedAt: ts() },
    candidates: [],
    declinedTechnicianIds: [],
    offerExpiresAt: null,
    source: "WEB",
    cancellation: null,
    createdAt: ts(),
    updatedAt: ts(),
    ...rest,
  };
}

export const assigned = { technicianId: "t1", participantIds: ["u1", "t1"], technicianSnapshot: { displayName: "Kojo Asante", photoPath: null } };

export function history(...statuses: Booking["status"][]): HistoryEntry[] {
  return statuses.map((to, i) => ({
    id: `h${i}`,
    from: i === 0 ? null : statuses[i - 1]!,
    to,
    actor: i === 0 ? "CUSTOMER" : "TECHNICIAN",
    byUid: "u1",
    note: null,
    createdAt: ts(Date.UTC(2026, 9, 2, 9, i)),
  }));
}

/** A fresh fake store per call: every operation resolves unless overridden. */
export function fakeBookingStore(overrides: Partial<BookingStore> = {}): BookingStore {
  return {
    create: vi.fn(async () => ({ ok: true as const, id: "bk_new" })),
    selectTechnician: vi.fn(async () => ({ ok: true as const, id: "bk_1" })),
    rematch: vi.fn(async () => ({ ok: true as const, id: "bk_1" })),
    cancel: vi.fn(async () => ({ ok: true as const, id: "bk_1" })),
    respondToQuote: vi.fn(async () => ({ ok: true as const, id: "bk_1" })),
    confirm: vi.fn(async () => ({ ok: true as const, id: "bk_1" })),
    reassign: vi.fn(async () => ({ ok: true as const, id: "bk_1" })),
    setPrice: vi.fn(async () => ({ ok: true as const, id: "bk_1" })),
    ...overrides,
  };
}

/** A watcher that delivers `value` once and never errors. */
export function staticWatch<T>(value: T) {
  return vi.fn((...args: unknown[]) => {
    const onData = args.find((a) => typeof a === "function") as (v: T) => void;
    onData(value);
    return () => undefined;
  });
}
