import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { RequestForm } from "../../features/bookings/RequestForm";
import { renderWithAuth, signedIn } from "../../test/auth";
import { assigned, booking, fakeBookingStore, history, staticWatch } from "../../test/bookings";
import { address, renderWithProfile } from "../../test/profile";
import { SERVICES } from "../../test/technician";
import { AdminBookingDetailPage, AdminBookingsPage } from "../admin/AdminBookingPages";
import { BookingDetailPage, BookingsPage, RequestServicePage } from "./BookingPages";
import { CustomerHome } from "./CustomerHome";

const NOW = Date.UTC(2026, 9, 2, 9, 0);

function renderForm(props: Partial<Parameters<typeof RequestForm>[0]> = {}) {
  const onSubmit = vi.fn();
  render(
    <MemoryRouter>
      <RequestForm services={SERVICES} addresses={[address("home"), address("work")]} defaultAddressId="home" now={() => NOW} onSubmit={onSubmit} {...props} />
    </MemoryRouter>,
  );
  return onSubmit;
}

describe("RequestForm", () => {
  it("needs a service and a real problem description", async () => {
    const onSubmit = renderForm();
    await userEvent.type(screen.getByLabelText("What's the problem?"), "Leak");
    await userEvent.click(screen.getByRole("button", { name: "Request a technician" }));
    expect(screen.getByText("Choose a service")).toBeInTheDocument();
    expect(screen.getByText(/at least 10 characters/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("preselects the service from the link, uses the default address and submits ASAP", async () => {
    const onSubmit = renderForm({ initialServiceId: "electrical" });
    expect(screen.getByLabelText("Service")).toHaveValue("electrical");
    expect(screen.getByText(/Typical price/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("What's the problem?"), "Sockets in the kitchen spark");
    await userEvent.click(screen.getByRole("button", { name: "Request a technician" }));
    expect(onSubmit).toHaveBeenCalledWith({
      serviceId: "electrical",
      problemDescription: "Sockets in the kitchen spark",
      addressId: "home",
      preferredTime: "ASAP",
      scheduledAt: undefined,
    });
  });

  it("scheduled jobs need a time at least an hour ahead, sent as ISO", async () => {
    const onSubmit = renderForm({ initialServiceId: "plumbing" });
    await userEvent.type(screen.getByLabelText("What's the problem?"), "Install a new water heater");
    await userEvent.click(screen.getByLabelText("work", { exact: false }));
    await userEvent.click(screen.getByLabelText("Choose a date and time"));
    await userEvent.click(screen.getByRole("button", { name: "Request a technician" }));
    expect(screen.getByText("Choose a date and time", { selector: "[role=alert]" })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Date and time"), "2026-10-02T09:30");
    await userEvent.click(screen.getByRole("button", { name: "Request a technician" }));
    expect(screen.getByText(/at least 60 minutes/)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Date and time"));
    await userEvent.type(screen.getByLabelText("Date and time"), "2026-10-03T10:00");
    await userEvent.click(screen.getByRole("button", { name: "Request a technician" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ addressId: "work", preferredTime: "SCHEDULED", scheduledAt: new Date("2026-10-03T10:00").toISOString() }),
    );
  });

  it("asks for an address first when none is saved", () => {
    renderForm({ addresses: [], defaultAddressId: null });
    expect(screen.getByRole("link", { name: "Add an address" })).toHaveAttribute("href", "/app/profile");
  });
});

describe("RequestServicePage", () => {
  it("creates the booking and opens it; a retry after an error reuses the same request id", async () => {
    let calls = 0;
    const store = fakeBookingStore({
      create: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw { code: "functions/unavailable" };
        return { ok: true as const, id: "bk_new" };
      }),
    });
    renderWithProfile(<RequestServicePage store={store} watchServices={staticWatch(SERVICES)} />, { path: "/app/request" });
    await userEvent.selectOptions(screen.getByLabelText("Service"), "plumbing");
    await userEvent.type(screen.getByLabelText("What's the problem?"), "Kitchen sink pipe is leaking");
    await userEvent.click(screen.getByRole("button", { name: "Request a technician" }));
    expect(await screen.findByText(/couldn't reach ServiceFlow/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Request a technician" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/app/bookings/bk_new"));
    const [first, second] = vi.mocked(store.create).mock.calls.map((c) => c[0]);
    expect(first?.requestId).toBe(second?.requestId);
    expect(second).toMatchObject({ serviceId: "plumbing", addressId: "home", preferredTime: "ASAP" });
  });
});

describe("BookingsPage and dashboard", () => {
  const list = [
    booking({ id: "open1", status: "REQUESTED" }),
    booking({ id: "done1", status: "CUSTOMER_CONFIRMED", ...assigned }),
    booking({ id: "asTech", customerId: "someone-else", ...assigned }), // the user is the technician here
  ];

  it("splits open and past bookings and hides jobs where the user is the technician", async () => {
    renderWithProfile(<BookingsPage watchMine={staticWatch(list)} />, { path: "/app/bookings" });
    expect(screen.getByTestId("booking-open1")).toHaveTextContent("Finding a technician");
    expect(screen.queryByTestId("booking-done1")).toBeNull();
    expect(screen.queryByTestId("booking-asTech")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Past" }));
    expect(screen.getByTestId("booking-done1")).toHaveTextContent("Completed");
  });

  it("the dashboard lists open bookings", () => {
    renderWithProfile(<CustomerHome watchMine={staticWatch(list)} />);
    const section = screen.getByRole("region", { name: "Open bookings" });
    expect(within(section).getByText("Plumbing")).toBeInTheDocument();
    expect(within(section).getAllByRole("link")).toHaveLength(1);
  });
});

describe("BookingDetailPage", () => {
  const renderDetail = (b: ReturnType<typeof booking>, store = fakeBookingStore(), steps = history("REQUESTED")) => {
    renderWithProfile(<BookingDetailPage store={store} watchOne={staticWatch(b)} watchSteps={staticWatch(steps)} />, {
      path: "/app/bookings/:id",
    });
    return store;
  };

  it("with nobody available: says so, can search again, and the customer can cancel with a reason", async () => {
    const store = renderDetail(booking({ status: "MATCHING" }));
    expect(screen.getAllByText("Finding a technician").length).toBeGreaterThan(0);
    expect(screen.getByText("No technician is available right now")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Search again" }));
    expect(store.rematch).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "bk_1" }));
    expect(screen.getByText(/GH₵100.00 – GH₵300.00 \(estimate\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    expect(screen.getByText("Give a short reason")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Reason for cancelling"), "Fixed it myself");
    await userEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    expect(store.cancel).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "bk_1", reason: "Fixed it myself" }));
  });

  it("lists recommended technicians (hiding ones who declined) and offers the job to the chosen one", async () => {
    const candidate = (technicianId: string, displayName: string, averageRating = 4.8) => ({ technicianId, displayName, averageRating, completedJobs: 12, distanceKm: 1.4, score: 0.8 });
    const b = booking({
      status: "MATCHING",
      candidates: [candidate("t1", "Kwame Owusu"), candidate("t2", "Ama Serwaa", 0), candidate("t3", "Yaw Mensah")],
      declinedTechnicianIds: ["t3"],
    });
    const store = renderDetail(b);
    expect(screen.getByTestId("candidate-t1")).toHaveTextContent("★ 4.8 · 12 jobs done · 1.4 km away");
    expect(screen.getByTestId("candidate-t2")).toHaveTextContent("New on ServiceFlow");
    expect(screen.queryByTestId("candidate-t3")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Choose Ama Serwaa" }));
    expect(store.selectTechnician).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "bk_1", technicianId: "t2" }));
  });

  it("while an offer is out, shows who it went to and roughly how long they have", () => {
    const b = booking({
      status: "OFFERED",
      offeredTechnicianId: "t1",
      participantIds: ["u1", "t1"],
      candidates: [{ technicianId: "t1", displayName: "Kwame Owusu", averageRating: 4.8, completedJobs: 12, distanceKm: 1.4, score: 0.8 }],
      offerExpiresAt: { toMillis: () => Date.now() + 7.5 * 60_000 },
    });
    renderDetail(b);
    expect(screen.getByTestId("offer-panel")).toHaveTextContent("Waiting for Kwame Owusu to accept");
    expect(screen.getByTestId("offer-panel")).toHaveTextContent("about 8 minutes");
  });

  it("accepting the technician's price", async () => {
    const b = booking({ status: "ARRIVED", ...assigned, pricing: { quotedMinor: 25000, quoteStatus: "PROPOSED", quoteNote: "New trap needed" } as never });
    const store = renderDetail(b);
    const panel = screen.getByTestId("quote-panel");
    expect(panel).toHaveTextContent("GH₵250.00");
    expect(panel).toHaveTextContent("New trap needed");
    await userEvent.click(within(panel).getByRole("button", { name: "Accept price" }));
    expect(store.respondToQuote).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "bk_1", accept: true }));
    // Once the technician has arrived, only an admin can cancel.
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
  });

  it("declining a price needs a reason", async () => {
    const b = booking({ status: "ACCEPTED", ...assigned, pricing: { quotedMinor: 30000, quoteStatus: "PROPOSED" } as never });
    const store = renderDetail(b);
    const panel = screen.getByTestId("quote-panel");
    await userEvent.click(within(panel).getByRole("button", { name: "Decline" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Decline price" }));
    expect(within(panel).getByRole("alert")).toHaveTextContent(/Tell the technician why/);
    await userEvent.type(within(panel).getByLabelText("Why are you declining?"), "Too expensive");
    await userEvent.click(within(panel).getByRole("button", { name: "Decline price" }));
    expect(store.respondToQuote).toHaveBeenCalledWith(expect.objectContaining({ accept: false, reason: "Too expensive" }));
  });

  it("confirming completion at the agreed price", async () => {
    const b = booking({ status: "COMPLETED", ...assigned, pricing: { quotedMinor: 25000, quoteStatus: "ACCEPTED", priceSetBy: "TECHNICIAN" } as never });
    const store = renderDetail(b, fakeBookingStore(), history("REQUESTED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"));
    expect(screen.getByText("Kojo Asante")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-panel")).toHaveTextContent("GH₵250.00");
    expect(screen.getByRole("list", { name: "Booking history" }).children).toHaveLength(6);
    await userEvent.click(screen.getByRole("button", { name: "Confirm job completed" }));
    expect(store.confirm).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "bk_1" }));
  });

  it("shows who cancelled and why", () => {
    renderDetail(booking({ status: "CANCELLED", cancellation: { byUid: "t1", actor: "TECHNICIAN", reason: "Motorbike broke down", at: { toMillis: () => 0 } } }));
    expect(screen.getByText(/By the technician — Motorbike broke down/)).toBeInTheDocument();
  });
});

describe("admin bookings", () => {
  it("filters the list by status", async () => {
    const watchList = staticWatch([booking({ id: "a1" })]);
    renderWithAuth(<AdminBookingsPage watchList={watchList} />, { session: signedIn({ admin: true }), path: "/admin/bookings" });
    expect(screen.getByTestId("admin-booking-a1")).toHaveTextContent("Plumbing");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "OFFERED");
    expect(watchList).toHaveBeenLastCalledWith("OFFERED", expect.any(Function), expect.any(Function));
  });

  const renderAdmin = (b: ReturnType<typeof booking>, store = fakeBookingStore()) => {
    renderWithAuth(
      <AdminBookingDetailPage
        store={store}
        watchOne={staticWatch(b)}
        watchSteps={staticWatch(history("REQUESTED"))}
        watchPrivate={staticWatch({ customerName: "Ama Serwaa", customerPhone: "+233241234567", directions: "Blue gate", ghanaPostGps: null, notes: null })}
      />,
      { session: signedIn({ admin: true }), path: "/admin/bookings/:id" },
    );
    return store;
  };

  it("sets a price in cedis (sent as pesewas) with a reason, and explains when re-sign-in is needed", async () => {
    let calls = 0;
    const store = fakeBookingStore({
      setPrice: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw { code: "functions/unauthenticated", details: { code: "REAUTH_REQUIRED" } };
        return { ok: true as const, id: "bk_1" };
      }),
    });
    renderAdmin(booking({ status: "ARRIVED", ...assigned }), store);
    expect(screen.getByText(/Ama Serwaa · \+233241234567/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Price (GH₵)"), "520");
    await userEvent.type(screen.getByLabelText("Reason"), "Two pipes replaced");
    await userEvent.click(screen.getByRole("button", { name: "Set price" }));
    expect(await screen.findByRole("link", { name: "Sign in again" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set price" }));
    expect(await screen.findByText("Price updated.")).toBeInTheDocument();
    expect(store.setPrice).toHaveBeenLastCalledWith(expect.objectContaining({ amountMinor: 52000, reason: "Two pipes replaced" }));
    // Admins can still cancel once the technician is on site.
    expect(screen.getByRole("button", { name: "Cancel booking (admin)" })).toBeInTheDocument();
  });

  it("offers reassignment only for an offered job, and no price tool before assignment", async () => {
    const store = renderAdmin(booking({ status: "OFFERED", offeredTechnicianId: "t9", participantIds: ["u1", "t9"] }));
    expect(screen.queryByRole("button", { name: "Set price" })).toBeNull();
    expect(screen.getByText("Offered to t9")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Reason for reassigning"), "Technician unreachable");
    await userEvent.click(screen.getByRole("button", { name: "Reassign" }));
    expect(store.reassign).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "bk_1", reason: "Technician unreachable" }));
  });
});

