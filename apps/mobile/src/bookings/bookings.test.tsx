import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { Booking, BookingStore, HistoryEntry } from "./booking-store";
import { BookingList } from "./BookingList";
import { BookingView } from "./BookingView";
import { RequestForm } from "./RequestForm";

jest.mock("./booking-store", () => ({}));
jest.mock("../lib/call", () => ({
  messageFromError: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again."),
}));

const ts = { toMillis: () => Date.UTC(2026, 9, 2, 9, 0) };
const SERVICES = [
  { id: "plumbing", name: "Plumbing", slug: "plumbing", description: "", iconPath: null, priceRange: { minMinor: 10000, maxMinor: 40000 }, isActive: true, sortOrder: 1 },
] as never[];
const ADDRESSES = [
  { id: "home", label: "Home", directions: "Blue gate", ghanaPostGps: null, areaId: "osu", areaName: "Osu", location: { lat: 5.55, lng: -0.17 }, notes: null, createdAt: ts, updatedAt: ts },
  { id: "work", label: "Work", directions: "Floor 2", ghanaPostGps: null, areaId: "osu", areaName: "Osu", location: { lat: 5.55, lng: -0.17 }, notes: null, createdAt: ts, updatedAt: ts },
] as never[];

function booking(overrides: Partial<Booking> = {}): Booking {
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
    location: { lat: 5.55, lng: -0.17, address: "Home, Osu", areaId: "osu" },
    preferredTime: "ASAP",
    scheduledAt: null,
    pricing: {
      estimateMinMinor: 10000,
      estimateMaxMinor: 40000,
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
    timeline: {},
    candidates: [],
    declinedTechnicianIds: [],
    offerExpiresAt: null,
    source: "MOBILE",
    cancellation: null,
    createdAt: ts,
    updatedAt: ts,
    ...rest,
  } as Booking;
}
const assigned = { technicianId: "t1", participantIds: ["u1", "t1"], technicianSnapshot: { displayName: "Kojo Asante", photoPath: null } };
const history: HistoryEntry[] = [{ id: "h1", from: null, to: "REQUESTED", actor: "CUSTOMER", byUid: "u1", note: null, createdAt: ts }];

function fakeStore(): Pick<BookingStore, "respondToQuote" | "confirm" | "cancel"> {
  return {
    respondToQuote: jest.fn(async () => ({ ok: true as const, id: "bk_1" })),
    confirm: jest.fn(async () => ({ ok: true as const, id: "bk_1" })),
    cancel: jest.fn(async () => ({ ok: true as const, id: "bk_1" })),
  };
}

describe("RequestForm (mobile)", () => {
  it("needs a service and a real description", () => {
    const onSubmit = jest.fn();
    render(<RequestForm services={SERVICES} addresses={ADDRESSES} defaultAddressId="home" onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByLabelText("What's the problem?"), "Leak");
    fireEvent.press(screen.getByRole("button", { name: "Request a technician" }));
    expect(screen.getByText("Choose a service")).toBeTruthy();
    expect(screen.getByText(/at least 10 characters/)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the chosen service, address and time", () => {
    const onSubmit = jest.fn();
    render(<RequestForm services={SERVICES} addresses={ADDRESSES} defaultAddressId="home" onSubmit={onSubmit} />);
    fireEvent.press(screen.getByRole("checkbox", { name: "Plumbing" }));
    expect(screen.getByText(/Typical price/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("What's the problem?"), "  Kitchen sink pipe is leaking ");
    fireEvent.press(screen.getByRole("checkbox", { name: "Work · Osu" }));
    fireEvent.press(screen.getByRole("checkbox", { name: "Tomorrow" }));
    fireEvent.press(screen.getByRole("button", { name: "Request a technician" }));
    expect(onSubmit).toHaveBeenCalledWith({ serviceId: "plumbing", problemDescription: "Kitchen sink pipe is leaking", addressId: "work", preferredTime: "TOMORROW" });
  });

  it("explains that an address is needed first", () => {
    render(<RequestForm services={SERVICES} addresses={[]} defaultAddressId={null} onSubmit={jest.fn()} />);
    expect(screen.getByText(/Add an address first/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Request a technician" })).toBeNull();
  });
});

describe("BookingView (mobile)", () => {
  it("while searching: honest status and a cancel that needs a reason", async () => {
    const store = fakeStore();
    render(<BookingView booking={booking()} history={history} store={store} />);
    expect(screen.getAllByText("Finding a technician").length).toBeGreaterThan(0);
    expect(screen.getByText("GH₵100.00 – GH₵400.00 (estimate)")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    fireEvent.press(screen.getByRole("button", { name: "Confirm cancellation" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give a short reason");
    fireEvent.changeText(screen.getByLabelText("Reason for cancelling"), "Fixed it myself");
    fireEvent.press(screen.getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(store.cancel).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "bk_1", reason: "Fixed it myself" })));
  });

  it("accepts the technician's price; no customer cancel once they've arrived", async () => {
    const store = fakeStore();
    render(
      <BookingView
        booking={booking({ status: "ARRIVED", ...assigned, pricing: { quotedMinor: 25000, quoteStatus: "PROPOSED", quoteNote: "New trap" } as never })}
        history={history}
        store={store}
      />,
    );
    expect(screen.getByText("Your technician's price: GH₵250.00")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Accept price" }));
    await waitFor(() => expect(store.respondToQuote).toHaveBeenCalledWith(expect.objectContaining({ accept: true })));
  });

  it("declining a price needs a reason", async () => {
    const store = fakeStore();
    render(<BookingView booking={booking({ status: "ACCEPTED", ...assigned, pricing: { quotedMinor: 40000, quoteStatus: "PROPOSED" } as never })} history={history} store={store} />);
    fireEvent.press(screen.getByRole("button", { name: "Decline" }));
    fireEvent.press(screen.getByRole("button", { name: "Decline price" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Tell the technician why/);
    fireEvent.changeText(screen.getByLabelText("Why are you declining?"), "Too expensive");
    fireEvent.press(screen.getByRole("button", { name: "Decline price" }));
    await waitFor(() => expect(store.respondToQuote).toHaveBeenCalledWith(expect.objectContaining({ accept: false, reason: "Too expensive" })));
  });

  it("confirms a completed job and reports a server refusal", async () => {
    const store = fakeStore();
    store.confirm = jest.fn(async () => {
      throw new Error("You can confirm only after the technician marks the work as completed.");
    });
    render(<BookingView booking={booking({ status: "COMPLETED", ...assigned, pricing: { quotedMinor: 25000, quoteStatus: "ACCEPTED" } as never })} history={history} store={store} />);
    expect(screen.getByText("GH₵250.00 (agreed)")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Confirm job completed" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/only after the technician/));
  });
});

describe("BookingList (mobile)", () => {
  it("separates open and past bookings and opens one", () => {
    const onOpen = jest.fn();
    render(<BookingList bookings={[booking({ id: "a" }), booking({ id: "b", status: "CANCELLED" })]} onOpen={onOpen} />);
    expect(screen.getByText("Past bookings")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Plumbing, Finding a technician" }));
    expect(onOpen).toHaveBeenCalledWith("a");
  });
});
