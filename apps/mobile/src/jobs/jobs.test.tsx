import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { Job, JobContact, JobPhoto } from "./job-store";
import { JobList } from "./JobList";
import { JobsSummary } from "./JobsSummary";
import { JobView, type JobViewProps, formatCountdown, navigationUrls } from "./JobView";

jest.mock("./job-store", () => ({}));
jest.mock("../lib/call", () => ({
  messageFromError: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again."),
}));

const NOW = Date.UTC(2026, 9, 2, 9, 0);
const ts = (ms = NOW) => ({ toMillis: () => ms });
const UID = "t1";

function job(overrides: Partial<Job> = {}): Job {
  const { pricing, ...rest } = overrides;
  return {
    id: "bk_1",
    customerId: "c1",
    technicianId: UID,
    offeredTechnicianId: null,
    participantIds: ["c1", UID],
    serviceId: "plumbing",
    serviceSnapshot: { name: "Plumbing" },
    technicianSnapshot: { displayName: "Kojo", photoPath: null },
    status: "ACCEPTED",
    problemDescription: "Kitchen sink pipe is leaking",
    location: { lat: 5.55, lng: -0.17, address: "Home, Osu", areaId: "osu" },
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
    timeline: {},
    candidates: [{ technicianId: UID, displayName: "Kojo", averageRating: 4.5, completedJobs: 3, distanceKm: 1.2, score: 0.8 }],
    declinedTechnicianIds: [],
    offerExpiresAt: null,
    source: "WEB",
    cancellation: null,
    createdAt: ts(),
    updatedAt: ts(),
    ...rest,
  } as Job;
}
const offered = (msLeft = 4 * 60_000 + 5_000) =>
  job({ status: "OFFERED", technicianId: null, offeredTechnicianId: UID, offerExpiresAt: ts(NOW + msLeft) });
const contact: JobContact = { customerName: "Ama Mensah", customerPhone: "+233241234567", directions: "Blue gate opposite Shell", ghanaPostGps: "GA-543-0125", notes: null };

function fakeStore() {
  return {
    respondToOffer: jest.fn(async () => ({ ok: true as const, id: "bk_1" })),
    advance: jest.fn(async () => ({ ok: true as const, id: "bk_1" })),
    submitQuote: jest.fn(async () => ({ ok: true as const, id: "bk_1" })),
    cancel: jest.fn(async () => ({ ok: true as const, id: "bk_1" })),
    addPhoto: jest.fn(async () => ({ ok: true as const, id: "m1" })),
  };
}

function renderJob(props: Partial<JobViewProps> = {}) {
  const store = fakeStore();
  const all: JobViewProps = {
    job: job(),
    uid: UID,
    contact: null,
    photos: [],
    now: NOW,
    store,
    pickPhoto: jest.fn(async () => "file:///photo.jpg"),
    getLocation: jest.fn(async () => ({ lat: 5.6, lng: -0.19 })),
    openUrl: jest.fn(),
    ...props,
  };
  render(<JobView {...all} />);
  return all as JobViewProps & { store: ReturnType<typeof fakeStore> };
}

describe("helpers", () => {
  it("formats countdowns and navigation links", () => {
    expect(formatCountdown(4 * 60_000 + 5_000)).toBe("4:05");
    expect(formatCountdown(-5)).toBe("0:00");
    expect(navigationUrls(5.55, -0.17)).toEqual(["google.navigation:q=5.55,-0.17", "https://www.google.com/maps/dir/?api=1&destination=5.55,-0.17"]);
  });
});

describe("JobView — offers", () => {
  it("shows a countdown and accepts", async () => {
    const p = renderJob({ job: offered() });
    expect(screen.getByTestId("countdown")).toHaveTextContent("Answer within 4:05");
    expect(screen.getByText(/1.2 km from your area/)).toBeTruthy();
    // No customer contact before accepting.
    expect(screen.queryByTestId("contact")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Accept job" }));
    await waitFor(() => expect(p.store.respondToOffer).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "bk_1", accept: true })));
  });

  it("declines with an optional reason", async () => {
    const p = renderJob({ job: offered() });
    fireEvent.press(screen.getByRole("button", { name: "Decline" }));
    fireEvent.changeText(screen.getByLabelText("Reason (optional)"), "Too far today");
    fireEvent.press(screen.getByRole("button", { name: "Decline job" }));
    await waitFor(() => expect(p.store.respondToOffer).toHaveBeenCalledWith(expect.objectContaining({ accept: false, reason: "Too far today" })));
  });

  it("can't accept an expired offer", () => {
    const p = renderJob({ job: offered(-1000) });
    expect(screen.getByTestId("countdown")).toHaveTextContent("This offer has expired");
    fireEvent.press(screen.getByRole("button", { name: "Accept job" }));
    expect(p.store.respondToOffer).not.toHaveBeenCalled();
  });
});

describe("JobView — on the job", () => {
  it("after accepting: call and navigate, then set off with the location captured once", async () => {
    const p = renderJob({ contact });
    expect(screen.getByText("Blue gate opposite Shell")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Call customer" }));
    expect(p.openUrl).toHaveBeenCalledWith(["tel:+233241234567"]);
    fireEvent.press(screen.getByRole("button", { name: "Navigate" }));
    expect(p.openUrl).toHaveBeenLastCalledWith(navigationUrls(5.55, -0.17));
    fireEvent.press(screen.getByRole("button", { name: "I'm on my way" }));
    await waitFor(() => expect(p.store.advance).toHaveBeenCalledWith(expect.objectContaining({ to: "EN_ROUTE", location: { lat: 5.6, lng: -0.19 } })));
  });

  it("on site: quote within the range (validated locally), and work can't start before the customer agrees", async () => {
    const p = renderJob({ job: job({ status: "ARRIVED" }), contact });
    fireEvent.press(screen.getByRole("button", { name: "Start work" }));
    expect(p.store.advance).not.toHaveBeenCalled();
    expect(screen.getByText(/Agree a price with the customer/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Your price (GH₵)"), "450");
    fireEvent.press(screen.getByRole("button", { name: "Send price" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/between GH₵100.00 – GH₵300.00/);
    fireEvent.changeText(screen.getByLabelText("Your price (GH₵)"), "250");
    fireEvent.changeText(screen.getByLabelText("What it covers (optional)"), "New trap and seal");
    fireEvent.press(screen.getByRole("button", { name: "Send price" }));
    await waitFor(() => expect(p.store.submitQuote).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 25000, note: "New trap and seal" })));
  });

  it("shows the customer's answer to the price", () => {
    renderJob({ job: job({ status: "ARRIVED", pricing: { quotedMinor: 28000, quoteStatus: "REJECTED", quoteRejectionReason: "Too expensive" } as never }) });
    expect(screen.getByText(/declined your price: “Too expensive”/)).toBeTruthy();
  });

  it("adds before photos on site and reports problems", async () => {
    const photos: JobPhoto[] = [{ id: "m1", kind: "BEFORE", storagePath: "x", contentType: "image/jpeg", sizeBytes: 1, uploadedBy: UID, createdAt: ts() }];
    const p = renderJob({ job: job({ status: "ARRIVED" }), photos });
    expect(screen.getByTestId("photo-count")).toHaveTextContent("1 before · 0 after");
    expect(screen.queryByRole("button", { name: "Add after photo" })).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Add before photo" }));
    await waitFor(() => expect(p.store.addPhoto).toHaveBeenCalledWith("bk_1", "BEFORE", "file:///photo.jpg"));
  });

  it("finishes the job with notes once the price is agreed", async () => {
    const p = renderJob({ job: job({ status: "IN_PROGRESS", pricing: { quotedMinor: 25000, quoteStatus: "ACCEPTED" } as never }) });
    expect(screen.getByText("Agreed price: GH₵250.00.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add after photo" })).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Notes for the customer (optional)"), "Replaced the trap");
    fireEvent.press(screen.getByRole("button", { name: "Finish job" }));
    await waitFor(() => expect(p.store.advance).toHaveBeenCalledWith(expect.objectContaining({ to: "COMPLETED", notes: "Replaced the trap", location: undefined })));
  });

  it("can cancel an accepted job with a reason, but not once on site", async () => {
    const p = renderJob();
    fireEvent.press(screen.getByRole("button", { name: "Can't do this job" }));
    fireEvent.press(screen.getByRole("button", { name: "Cancel job" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give a short reason");
    fireEvent.changeText(screen.getByLabelText("Reason for cancelling"), "Motorbike broke down");
    fireEvent.press(screen.getByRole("button", { name: "Cancel job" }));
    await waitFor(() => expect(p.store.cancel).toHaveBeenCalledWith(expect.objectContaining({ reason: "Motorbike broke down" })));
  });

  it("no step buttons once finished", () => {
    renderJob({ job: job({ status: "COMPLETED" }) });
    expect(screen.getByText("Finished — waiting for the customer to confirm")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Finish job" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Can't do this job" })).toBeNull();
  });
});

describe("JobList and JobsSummary", () => {
  const jobs = [
    offered(),
    job({ id: "active", status: "EN_ROUTE" }),
    job({ id: "later", status: "ACCEPTED", preferredTime: "SCHEDULED" }),
    job({ id: "old", status: "CUSTOMER_CONFIRMED" }),
  ];

  it("sorts jobs into tabs with the offer countdown", () => {
    const onOpen = jest.fn();
    render(<JobList jobs={jobs} uid={UID} now={NOW} onOpen={onOpen} />);
    for (const title of ["New requests", "Active", "Upcoming", "Done"]) expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText("4:05")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Plumbing, On your way" }));
    expect(onOpen).toHaveBeenCalledWith("active");
  });

  it("puts the current job and new requests on Home", () => {
    const onOpen = jest.fn();
    render(<JobsSummary jobs={jobs} uid={UID} now={NOW} onOpen={onOpen} onOpenJobs={jest.fn()} />);
    expect(screen.getByTestId("current-job")).toHaveTextContent(/On your way/);
    expect(screen.getByTestId("new-requests")).toHaveTextContent(/1 new request · answer within 4:05/);
    fireEvent.press(screen.getByRole("button", { name: "See request" }));
    expect(onOpen).toHaveBeenCalledWith("bk_1");
  });

  it("says when there's nothing to do", () => {
    render(<JobsSummary jobs={[]} uid={UID} now={NOW} onOpen={jest.fn()} onOpenJobs={jest.fn()} />);
    expect(screen.getByText(/No current job/)).toBeTruthy();
  });
});
