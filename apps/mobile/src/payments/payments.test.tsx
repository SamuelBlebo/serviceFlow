import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { Job } from "../jobs/job-store";
import { JobView } from "../jobs/JobView";
import { PaymentCard } from "./PaymentCard";
import type { Payment } from "./payment-store";

jest.mock("./payment-store", () => ({}));
jest.mock("../jobs/job-store", () => ({}));
jest.mock("../lib/call", () => ({
  messageFromError: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again."),
}));

const ts = { toMillis: () => 0 };
function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "bk_1",
    customerId: "c1",
    technicianId: "t1",
    amountMinor: 25000,
    commissionMinor: 3750,
    technicianNetMinor: 21250,
    commissionPercent: 15,
    refundedMinor: 0,
    currency: "GHS",
    method: null,
    status: "PENDING",
    provider: null,
    providerReference: null,
    attempts: 0,
    lastAttemptAt: null,
    failureReason: null,
    cashStatus: null,
    createdAt: ts,
    updatedAt: ts,
    paidAt: null,
    ...overrides,
  };
}

describe("PaymentCard (mobile)", () => {
  it("pays by Mobile Money on the chosen network, number prefilled", async () => {
    const store = { initiate: jest.fn(async () => ({ ok: true as const, id: "bk_1", status: "PENDING" as const })) };
    render(<PaymentCard bookingId="bk_1" bookingStatus="CUSTOMER_CONFIRMED" payment={payment()} cashAllowed accountPhone="+233241234567" store={store} />);
    fireEvent.press(screen.getByRole("checkbox", { name: "AirtelTigo Money" }));
    fireEvent.press(screen.getByRole("button", { name: "Pay GH₵250.00" }));
    await waitFor(() => expect(store.initiate).toHaveBeenCalledWith(expect.objectContaining({ method: "MOBILE_MONEY", msisdn: "024 123 4567", network: "AT_MONEY" })));
  });

  it("offers cash only when allowed", () => {
    const store = { initiate: jest.fn() };
    const { rerender } = render(<PaymentCard bookingId="bk_1" bookingStatus="CUSTOMER_CONFIRMED" payment={payment()} cashAllowed={false} accountPhone={null} store={store} />);
    expect(screen.queryByRole("checkbox", { name: "Cash to the technician" })).toBeNull();
    rerender(<PaymentCard bookingId="bk_1" bookingStatus="CUSTOMER_CONFIRMED" payment={payment()} cashAllowed accountPhone={null} store={store} />);
    expect(screen.getByRole("checkbox", { name: "Cash to the technician" })).toBeTruthy();
  });

  it("explains the waiting states and shows paid", () => {
    const store = { initiate: jest.fn() };
    const { rerender } = render(
      <PaymentCard bookingId="bk_1" bookingStatus="CUSTOMER_CONFIRMED" payment={payment({ method: "MOBILE_MONEY", attempts: 1 })} cashAllowed accountPhone={null} store={store} />,
    );
    expect(screen.getByText(/Approve the payment prompt on your phone/)).toBeTruthy();
    rerender(<PaymentCard bookingId="bk_1" bookingStatus="CUSTOMER_CONFIRMED" payment={payment({ method: "CASH", cashStatus: "AWAITING_TECHNICIAN" })} cashAllowed accountPhone={null} store={store} />);
    expect(screen.getByText(/in cash to your technician/)).toBeTruthy();
    rerender(<PaymentCard bookingId="bk_1" bookingStatus="PAID" payment={payment({ status: "SUCCEEDED", method: "MOBILE_MONEY" })} cashAllowed accountPhone={null} store={store} />);
    expect(screen.getByText("Paid GH₵250.00")).toBeTruthy();
  });
});

describe("JobView cash confirmation (mobile)", () => {
  it("the assigned technician confirms the customer's cash", async () => {
    const job = {
      id: "bk_1",
      customerId: "c1",
      technicianId: "t1",
      offeredTechnicianId: null,
      participantIds: ["c1", "t1"],
      serviceId: "plumbing",
      serviceSnapshot: { name: "Plumbing" },
      technicianSnapshot: { displayName: "Kojo", photoPath: null },
      status: "CUSTOMER_CONFIRMED",
      problemDescription: "Leaking pipe in the kitchen",
      location: { lat: 5.55, lng: -0.17, address: "Home, Osu", areaId: "osu" },
      preferredTime: "ASAP",
      scheduledAt: null,
      pricing: { estimateMinMinor: 10000, estimateMaxMinor: 30000, quotedMinor: 25000, quoteStatus: "ACCEPTED", quoteNote: null, quoteRejectionReason: null, priceSetBy: "TECHNICIAN", finalMinor: 25000, commissionPercentSnapshot: 15, currency: "GHS" },
      timeline: {},
      candidates: [],
      declinedTechnicianIds: [],
      offerExpiresAt: null,
      source: "WEB",
      cancellation: null,
      createdAt: ts,
      updatedAt: ts,
    } as unknown as Job;
    const confirmCash = jest.fn(async () => ({ ok: true }));
    render(
      <JobView
        job={job}
        uid="t1"
        contact={null}
        photos={[]}
        now={0}
        store={{ respondToOffer: jest.fn(), advance: jest.fn(), submitQuote: jest.fn(), cancel: jest.fn(), addPhoto: jest.fn(), confirmCash } as never}
        payment={payment({ method: "CASH", cashStatus: "AWAITING_TECHNICIAN" })}
        pickPhoto={jest.fn()}
        getLocation={jest.fn()}
        openUrl={jest.fn()}
      />,
    );
    expect(screen.getByText(/paying GH₵250.00 in cash/)).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Confirm cash received" }));
    await waitFor(() => expect(confirmCash).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "bk_1" })));
  });
});
