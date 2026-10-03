import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { JobStore } from "../../lib/technician/job-store";
import { renderWithAuth, signedIn } from "../../test/auth";
import { booking, staticWatch } from "../../test/bookings";
import { AboutPage, ContactPage, HowItWorksPage } from "../public/InfoPages";
import { TechJobDetailPage, TechJobsCard, TechJobsPage } from "./TechJobsPages";

// signedIn() is user "u1": here, the technician.
const NOW = Date.UTC(2026, 9, 2, 9, 0);
const tech = { session: signedIn({ tech: true }) };
const mine = { technicianId: "u1", customerId: "c1", participantIds: ["c1", "u1"] };
const offer = (msLeft = 3 * 60_000 + 30_000) =>
  booking({ id: "offer1", customerId: "c1", status: "OFFERED", technicianId: null, offeredTechnicianId: "u1", participantIds: ["c1", "u1"], offerExpiresAt: { toMillis: () => NOW + msLeft } });

function fakeJobStore(): JobStore {
  return {
    respondToOffer: vi.fn(async () => ({ ok: true as const, id: "b" })),
    advance: vi.fn(async () => ({ ok: true as const, id: "b" })),
    submitQuote: vi.fn(async () => ({ ok: true as const, id: "b" })),
    cancel: vi.fn(async () => ({ ok: true as const, id: "b" })),
  };
}

const contact = { customerName: "Ama Mensah", customerPhone: "+233241234567", directions: "Blue gate", ghanaPostGps: null, notes: null };

function renderDetail(job: ReturnType<typeof booking>, store = fakeJobStore()) {
  renderWithAuth(
    <TechJobDetailPage store={store} watchOne={staticWatch(job)} watchContact={(_id, ok) => (ok(job.technicianId === "u1" ? contact : null), () => undefined)} clock={() => NOW} />,
    { ...tech, path: "/tech/jobs/:id" },
  );
  return store;
}

describe("TechJobsPage", () => {
  it("groups jobs and shows the offer countdown", () => {
    const jobs = [offer(), booking({ id: "a1", status: "ARRIVED", ...mine }), booking({ id: "d1", status: "CUSTOMER_CONFIRMED", ...mine }), booking({ id: "mine-as-customer", customerId: "u1" })];
    renderWithAuth(<TechJobsPage watchJobs={staticWatch(jobs)} clock={() => NOW} />, { ...tech, path: "/tech/jobs" });
    expect(screen.getByTestId("job-offer1")).toHaveTextContent("Answer within 3:30");
    expect(screen.getByTestId("job-a1")).toHaveTextContent("On site");
    expect(screen.getByTestId("job-d1")).toHaveTextContent("Confirmed by the customer");
    expect(screen.queryByTestId("job-mine-as-customer")).toBeNull();
  });
});

describe("TechJobDetailPage", () => {
  it("accepts a live offer; no customer contact before accepting", async () => {
    const store = renderDetail(offer());
    expect(screen.getByTestId("tech-status")).toHaveTextContent("New job offer · answer within 3:30");
    expect(screen.queryByTestId("job-contact")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Accept job" }));
    expect(store.respondToOffer).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "offer1", accept: true }));
  });

  it("can't accept an expired offer", () => {
    renderDetail(offer(-1));
    expect(screen.getByTestId("tech-status")).toHaveTextContent("this offer has expired");
    expect(screen.getByRole("button", { name: "Accept job" })).toBeDisabled();
  });

  it("after accepting: contact, directions and one next step", async () => {
    const store = renderDetail(booking({ status: "ACCEPTED", ...mine }));
    expect(screen.getByRole("link", { name: "Call +233241234567" })).toHaveAttribute("href", "tel:+233241234567");
    expect(screen.getByRole("link", { name: "Open directions in Google Maps" })).toHaveAttribute("href", expect.stringContaining("destination=5.6494,-0.1531"));
    await userEvent.click(screen.getByRole("button", { name: "I'm on my way" }));
    expect(store.advance).toHaveBeenCalledWith(expect.objectContaining({ to: "EN_ROUTE" }));
  });

  it("on site: quote inside the range, and work waits for the customer", async () => {
    const store = renderDetail(booking({ status: "ARRIVED", ...mine }));
    expect(screen.getByRole("button", { name: "Start work" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Your price (GH₵)"), "450");
    await userEvent.click(screen.getByRole("button", { name: "Send price" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/between/);
    await userEvent.clear(screen.getByLabelText("Your price (GH₵)"));
    await userEvent.type(screen.getByLabelText("Your price (GH₵)"), "250");
    await userEvent.click(screen.getByRole("button", { name: "Send price" }));
    await waitFor(() => expect(store.submitQuote).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 25000 })));
  });

  it("finishes with notes once the price is agreed", async () => {
    const store = renderDetail(booking({ status: "IN_PROGRESS", ...mine, pricing: { quotedMinor: 25000, quoteStatus: "ACCEPTED" } as never }));
    await userEvent.type(screen.getByLabelText("Notes for the customer (optional)"), "Replaced the trap");
    await userEvent.click(screen.getByRole("button", { name: "Finish job" }));
    expect(store.advance).toHaveBeenCalledWith(expect.objectContaining({ to: "COMPLETED", notes: "Replaced the trap" }));
  });

  it("refuses jobs that aren't the user's", () => {
    renderDetail(booking({ technicianId: "someone-else", participantIds: ["c1", "someone-else"] }));
    expect(screen.getByText("This job is no longer available to you.")).toBeInTheDocument();
  });
});

describe("TechJobsCard", () => {
  it("shows the current job and new requests on the dashboard", () => {
    render(
      <MemoryRouter>
        <TechJobsCard uid="u1" watchJobs={staticWatch([offer(), booking({ id: "a1", status: "EN_ROUTE", ...mine })])} clock={() => NOW} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Current job")).toBeInTheDocument();
    expect(screen.getByText("On your way · Home, East Legon")).toBeInTheDocument();
    expect(screen.getByText(/1 new request · answer within 3:30/)).toBeInTheDocument();
  });
});

describe("public info pages", () => {
  it("render real content", () => {
    for (const Page of [HowItWorksPage, AboutPage, ContactPage]) {
      const { unmount } = render(
        <MemoryRouter>
          <Page />
        </MemoryRouter>,
      );
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      unmount();
    }
    render(
      <MemoryRouter>
        <HowItWorksPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Agree the price before any work")).toBeInTheDocument();
  });
});
