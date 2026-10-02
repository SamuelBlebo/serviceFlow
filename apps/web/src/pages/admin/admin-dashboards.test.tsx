import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_PLATFORM_SETTINGS } from "@serviceflow/shared";
import { describe, expect, it, vi } from "vitest";
import type { AdminStore } from "../../lib/admin/admin-store";
import { renderWithAuth, signedIn } from "../../test/auth";
import { assigned, booking, staticWatch } from "../../test/bookings";
import { technician, verification } from "../../test/technician";
import { AdminAuditPage, AdminCustomerDetailPage, AdminCustomersPage, AdminHomePage, AdminTechnicianDetailPage } from "./AdminDashboardPages";
import { AdminSettingsPage } from "./AdminSettingsPage";

const admin = { session: signedIn({ admin: true }) };
const ts = (ms = Date.UTC(2026, 9, 2, 9, 0)) => ({ toMillis: () => ms });

function fakeAdminStore(overrides: Partial<AdminStore> = {}): AdminStore {
  const ok = vi.fn(async () => ({ ok: true as const, id: "x" }));
  return {
    suspendUser: ok,
    reactivateUser: vi.fn(async () => ({ ok: true as const, id: "x" })),
    updateSettings: vi.fn(async () => ({ ok: true as const, id: "platform" })),
    createCommissionRule: vi.fn(async () => ({ ok: true as const, id: "rule_1" })),
    setCommissionRuleActive: vi.fn(async () => ({ ok: true as const, id: "rule_1" })),
    upsertArea: vi.fn(async () => ({ ok: true as const, id: "spintex" })),
    setAreaActive: vi.fn(async () => ({ ok: true as const, id: "osu" })),
    ...overrides,
  };
}

const account = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  phone: "+233241234567",
  email: null,
  displayName: "Ama",
  status: "ACTIVE" as const,
  capabilities: { tech: false, admin: false },
  createdAt: ts(),
  ...overrides,
});

describe("AdminHomePage", () => {
  it("shows the headline numbers and the live bookings", async () => {
    const getKpis = vi.fn(async () => ({ bookingsToday: 7, waiting: 2, activeJobs: 3, techniciansOnline: 5, pendingVerifications: 1 }));
    renderWithAuth(<AdminHomePage getKpis={getKpis} watchLive={staticWatch([booking({ id: "live1", status: "EN_ROUTE", ...assigned })])} />, { ...admin, path: "/admin" });
    expect(await screen.findByTestId("kpi-Bookings today")).toHaveTextContent("7");
    expect(screen.getByTestId("kpi-Verifications to review")).toHaveTextContent("1");
    expect(screen.getByTestId("row-live1")).toHaveTextContent("Technician on the way");
  });
});

describe("customers", () => {
  it("lists customers and filters by name", async () => {
    const customers = [
      { id: "c1", fullName: "Ama Mensah", defaultAddressId: null, createdAt: ts(), updatedAt: ts() },
      { id: "c2", fullName: "Kofi Boateng", defaultAddressId: null, createdAt: ts(), updatedAt: ts() },
    ];
    renderWithAuth(<AdminCustomersPage watchAll={staticWatch(customers)} />, { ...admin, path: "/admin/customers" });
    await userEvent.type(screen.getByLabelText("Search by name"), "kofi");
    expect(screen.queryByTestId("customer-c1")).toBeNull();
    expect(screen.getByTestId("customer-c2")).toHaveAttribute("href", "/admin/customers/c2");
  });

  it("customer detail shows contact, addresses and bookings, and suspends with a reason (asking for a fresh sign-in when needed)", async () => {
    let calls = 0;
    const store = fakeAdminStore({
      suspendUser: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw { code: "functions/unauthenticated", details: { code: "REAUTH_REQUIRED" } };
        return { ok: true as const, id: "c1" };
      }),
    });
    renderWithAuth(
      <AdminCustomerDetailPage
        store={store}
        watchCustomerDoc={(_uid, ok) => (ok({ id: "c1", fullName: "Ama Mensah", defaultAddressId: "home", createdAt: ts(), updatedAt: ts() }), () => undefined)}
        watchAccountDoc={(_uid, ok) => (ok(account() as never), () => undefined)}
        watchAddresses={(_uid, ok) =>
          (ok([{ id: "home", label: "Home", directions: "Blue gate", ghanaPostGps: "GA-543-0125", areaId: "osu", areaName: "Osu", location: { lat: 5.5, lng: -0.1 }, notes: null, createdAt: ts(), updatedAt: ts() }]),
          () => undefined)
        }
        watchBookings={(_role, _uid, ok) => (ok([booking({ id: "b9" })]), () => undefined)}
      />,
      { ...admin, path: "/admin/customers/:uid", initialEntry: "/admin/customers/c1" },
    );
    expect(screen.getByText(/024 123 4567/)).toBeInTheDocument();
    expect(screen.getByText(/Blue gate \(GA-543-0125\) · default/)).toBeInTheDocument();
    expect(screen.getByTestId("row-b9")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Suspend…" }));
    await userEvent.type(screen.getByLabelText("Reason for suspending"), "Abusive to technicians");
    await userEvent.click(screen.getByRole("button", { name: "Suspend account" }));
    expect(await screen.findByRole("link", { name: "Sign in again" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Suspend account" }));
    await waitFor(() => expect(store.suspendUser).toHaveBeenLastCalledWith(expect.objectContaining({ uid: "c1", reason: "Abusive to technicians" })));
  });
});

describe("AdminTechnicianDetailPage", () => {
  it("shows stats, verification history and jobs", () => {
    const t = technician({ verificationStatus: "VERIFIED", stats: { ratingSum: 46, ratingCount: 10, avgRating: 4.6, completed: 18, cancelled: 2, offered: 25, responded: 20 } });
    renderWithAuth(
      <AdminTechnicianDetailPage
        store={fakeAdminStore()}
        watchTech={(_uid, ok) => (ok(t), () => undefined)}
        watchAccountDoc={(_uid, ok) => (ok(account({ capabilities: { tech: true, admin: false } }) as never), () => undefined)}
        watchVerifications={(_uid, ok) => (ok([verification({ status: "VERIFIED" })]), () => undefined)}
        watchBookings={(_role, _uid, ok) => (ok([booking({ id: "j1", ...assigned, status: "CUSTOMER_CONFIRMED" })]), () => undefined)}
        reviewStore={{ review: vi.fn(async () => ({ ok: true as const, id: "u1" })) }}
      />,
      { ...admin, path: "/admin/technicians/:uid" },
    );
    const stats = screen.getByRole("region", { name: "Statistics" });
    expect(within(stats).getByText("★ 4.6 (10)")).toBeInTheDocument();
    expect(within(stats).getByText("90%")).toBeInTheDocument(); // 18 / (18 + 2)
    expect(within(stats).getByText("80%")).toBeInTheDocument(); // 20 / 25
    expect(screen.getByText(/GHA-123456789-0 · verified/)).toBeInTheDocument();
    expect(screen.getByTestId("row-j1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suspend" })).toBeInTheDocument();
  });
});

describe("AdminAuditPage", () => {
  it("lists entries with their changes, filters by target and searches", async () => {
    const entries = [
      { id: "a1", adminUid: "boss", actionType: "BOOKING_PRICE_SET", targetType: "booking", targetId: "bk_1", before: { quotedMinor: 20000 }, after: { quotedMinor: 52000 }, reason: "Extra pipe", createdAtMs: 0 },
      { id: "a2", adminUid: "boss", actionType: "SERVICE_CREATED", targetType: "service", targetId: "roofing", before: null, after: { name: "Roofing" }, reason: null, createdAtMs: 0 },
    ];
    const watchLog = staticWatch(entries);
    renderWithAuth(<AdminAuditPage watchLog={watchLog} />, { ...admin, path: "/admin/audit" });
    expect(screen.getByTestId("audit-a1")).toHaveTextContent("quotedMinor: 20000 → 52000");
    await userEvent.type(screen.getByLabelText("Search"), "roofing");
    expect(screen.queryByTestId("audit-a1")).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("What changed"), "booking");
    expect(watchLog).toHaveBeenLastCalledWith("booking", expect.any(Function), expect.any(Function));
  });
});

describe("AdminSettingsPage", () => {
  const renderSettings = (store = fakeAdminStore()) => {
    renderWithAuth(
      <AdminSettingsPage
        store={store}
        watchSettings={staticWatch(DEFAULT_PLATFORM_SETTINGS)}
        watchRules={staticWatch([{ id: "r1", scope: "GLOBAL", serviceId: null, technicianId: null, percent: 15, isActive: true, createdAt: ts() }])}
        watchAreas={staticWatch([{ id: "osu", name: "Osu", city: "Accra", region: "Greater Accra", country: "GH", center: { lat: 5.55, lng: -0.17 }, defaultRadiusKm: 8, isActive: true }])}
        watchServices={staticWatch([{ id: "plumbing", name: "Plumbing", slug: "plumbing", description: "", iconPath: null, priceRange: { minMinor: 1, maxMinor: 2 }, isActive: true, sortOrder: 1 }])}
      />,
      { ...admin, path: "/admin/settings" },
    );
    return store;
  };

  it("validates and saves platform settings", async () => {
    const store = renderSettings();
    const commission = screen.getByLabelText("Default commission (%)");
    await userEvent.clear(commission);
    await userEvent.type(commission, "80");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/0 to 50/);
    await userEvent.clear(commission);
    await userEvent.type(commission, "12.5");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(store.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ defaultCommissionPercent: 12.5, offerTimeoutMinutes: 10 })));
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
  });

  it("keeps the confirmation when the saved settings come back from the server (regression)", async () => {
    let push: ((v: typeof DEFAULT_PLATFORM_SETTINGS) => void) | undefined;
    const store = fakeAdminStore({
      updateSettings: vi.fn(async () => {
        push?.({ ...DEFAULT_PLATFORM_SETTINGS, offerTimeoutMinutes: 7 });
        return { ok: true as const, id: "platform" };
      }),
    });
    renderWithAuth(
      <AdminSettingsPage
        store={store}
        watchSettings={(ok) => ((push = ok), ok(DEFAULT_PLATFORM_SETTINGS), () => undefined)}
        watchRules={staticWatch([])}
        watchAreas={staticWatch([])}
        watchServices={staticWatch([])}
      />,
      { ...admin, path: "/admin/settings" },
    );
    const offer = screen.getByLabelText("Offer time (minutes)");
    await userEvent.clear(offer);
    await userEvent.type(offer, "7");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
    expect(screen.getByLabelText("Offer time (minutes)")).toHaveValue("7");
  });

  it("adds a service commission rule and switches rules off", async () => {
    const store = renderSettings();
    await userEvent.type(screen.getByLabelText("Commission (%)"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the service");
    await userEvent.selectOptions(screen.getByLabelText("Service"), "plumbing");
    await userEvent.click(screen.getByRole("button", { name: "Add rule" }));
    await waitFor(() => expect(store.createCommissionRule).toHaveBeenCalledWith(expect.objectContaining({ scope: "SERVICE", serviceId: "plumbing", percent: 10 })));
    await userEvent.click(within(screen.getByTestId("rule-r1")).getByRole("button", { name: "Switch off" }));
    expect(store.setCommissionRuleActive).toHaveBeenCalledWith(expect.objectContaining({ ruleId: "r1", isActive: false }));
  });

  it("adds a service area inside Ghana and hides areas", async () => {
    const store = renderSettings();
    await userEvent.click(screen.getByRole("button", { name: "Add area" }));
    await userEvent.type(screen.getByLabelText("Area name"), "Spintex");
    await userEvent.type(screen.getByLabelText("Centre latitude"), "6.52");
    await userEvent.type(screen.getByLabelText("Centre longitude"), "3.38");
    await userEvent.click(screen.getByRole("button", { name: "Save area" }));
    expect(screen.getByRole("alert")).toHaveTextContent("must be in Ghana");
    await userEvent.clear(screen.getByLabelText("Centre latitude"));
    await userEvent.type(screen.getByLabelText("Centre latitude"), "5.63");
    await userEvent.clear(screen.getByLabelText("Centre longitude"));
    await userEvent.type(screen.getByLabelText("Centre longitude"), "-0.12");
    await userEvent.click(screen.getByRole("button", { name: "Save area" }));
    await waitFor(() => expect(store.upsertArea).toHaveBeenCalledWith(expect.objectContaining({ name: "Spintex", center: { lat: 5.63, lng: -0.12 }, defaultRadiusKm: 8 })));
    await userEvent.click(within(screen.getByTestId("area-osu")).getByRole("button", { name: "Hide" }));
    expect(store.setAreaActive).toHaveBeenCalledWith(expect.objectContaining({ areaId: "osu", isActive: false }));
  });
});
