import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Payment, PaymentStore } from "../../lib/payments/payment-store";
import { renderWithAuth, signedIn } from "../../test/auth";
import { booking, staticWatch } from "../../test/bookings";
import { AdminPaymentsPage } from "../../pages/admin/AdminBookingPages";
import { TechJobDetailPage } from "../../pages/tech/TechJobsPages";
import { PaymentPanel } from "./PaymentPanel";

const ts = { toMillis: () => 0 };
function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "bk_1",
    customerId: "u1",
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
function fakePayments(): PaymentStore {
  return {
    initiate: vi.fn(async () => ({ ok: true as const, id: "bk_1", status: "PENDING" as const })),
    confirmCash: vi.fn(async () => ({ ok: true as const, id: "bk_1" })),
    simulateOutcome: vi.fn(async () => ({ ok: true as const, id: "bk_1" })),
  };
}
const confirmed = booking({ status: "CUSTOMER_CONFIRMED", technicianId: "t1", participantIds: ["u1", "t1"] });

describe("PaymentPanel", () => {
  it("pays by Mobile Money with the account phone prefilled", async () => {
    const store = fakePayments();
    render(<PaymentPanel booking={confirmed} payment={payment()} cashAllowed accountPhone="+233241234567" store={store} />);
    expect(screen.getByRole("heading", { name: "Pay GH₵250.00" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mobile Money number")).toHaveValue("024 123 4567");
    await userEvent.selectOptions(screen.getByLabelText("Network"), "TELECEL_CASH");
    await userEvent.click(screen.getByRole("button", { name: "Pay GH₵250.00" }));
    expect(store.initiate).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "bk_1", method: "MOBILE_MONEY", msisdn: "024 123 4567", network: "TELECEL_CASH" }));
  });

  it("asks the customer to approve the prompt; the local sandbox can play the phone", async () => {
    const store = fakePayments();
    render(<PaymentPanel booking={confirmed} payment={payment({ method: "MOBILE_MONEY", attempts: 1, providerReference: "mock_bk_1_1" })} cashAllowed accountPhone={null} store={store} emulator />);
    expect(screen.getByTestId("awaiting-approval")).toHaveTextContent("Approve the payment prompt on your phone");
    await userEvent.click(screen.getByRole("button", { name: "Simulate approval" }));
    expect(store.simulateOutcome).toHaveBeenCalledWith({ bookingId: "bk_1", outcome: "SUCCEEDED" });
  });

  it("never shows the sandbox outside the emulator", () => {
    render(<PaymentPanel booking={confirmed} payment={payment({ method: "MOBILE_MONEY", attempts: 1 })} cashAllowed accountPhone={null} store={fakePayments()} />);
    expect(screen.queryByText("Simulate approval")).toBeNull();
  });

  it("offers cash only when allowed, and explains what happens next", async () => {
    const store = fakePayments();
    const { rerender } = render(<PaymentPanel booking={confirmed} payment={payment()} cashAllowed={false} accountPhone={null} store={store} />);
    expect(screen.queryByLabelText("Cash to the technician")).toBeNull();
    rerender(<PaymentPanel booking={confirmed} payment={payment()} cashAllowed accountPhone={null} store={store} />);
    await userEvent.click(screen.getByLabelText("Cash to the technician"));
    await userEvent.click(screen.getByRole("button", { name: "I'll pay in cash" }));
    expect(store.initiate).toHaveBeenCalledWith(expect.objectContaining({ method: "CASH" }));
    rerender(<PaymentPanel booking={confirmed} payment={payment({ method: "CASH", cashStatus: "AWAITING_TECHNICIAN" })} cashAllowed accountPhone={null} store={store} />);
    expect(screen.getByTestId("awaiting-cash")).toHaveTextContent("once they confirm");
  });

  it("shows a failed attempt with its reason and allows a retry; shows paid", () => {
    const { rerender } = render(
      <PaymentPanel booking={confirmed} payment={payment({ status: "FAILED", method: "MOBILE_MONEY", attempts: 1, failureReason: "The payment was declined or cancelled." })} cashAllowed accountPhone="+233241234567" store={fakePayments()} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("declined");
    expect(screen.getByRole("button", { name: "Pay GH₵250.00" })).toBeInTheDocument();
    rerender(<PaymentPanel booking={booking({ status: "PAID" })} payment={payment({ status: "SUCCEEDED", method: "MOBILE_MONEY" })} cashAllowed accountPhone={null} store={fakePayments()} />);
    expect(screen.getByText("Paid GH₵250.00")).toBeInTheDocument();
  });

  it("validates the Mobile Money number before sending", async () => {
    const store = fakePayments();
    render(<PaymentPanel booking={confirmed} payment={payment()} cashAllowed accountPhone={null} store={store} />);
    await userEvent.type(screen.getByLabelText("Mobile Money number"), "12345");
    await userEvent.click(screen.getByRole("button", { name: "Pay GH₵250.00" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Ghanaian phone/);
    expect(store.initiate).not.toHaveBeenCalled();
  });
});

describe("technician cash confirmation (web)", () => {
  it("confirms cash received for the technician's own job", async () => {
    const payments = fakePayments();
    // signedIn() is "u1": the technician here.
    const job = booking({ status: "CUSTOMER_CONFIRMED", customerId: "c1", technicianId: "u1", participantIds: ["c1", "u1"] });
    renderWithAuth(
      <TechJobDetailPage
        store={{ respondToOffer: vi.fn(), advance: vi.fn(), submitQuote: vi.fn(), cancel: vi.fn() } as never}
        watchOne={staticWatch(job)}
        watchContact={(_id, ok) => (ok(null), () => undefined)}
        payments={payments}
        watchPay={staticWatch(payment({ customerId: "c1", technicianId: "u1", method: "CASH", cashStatus: "AWAITING_TECHNICIAN" }))}
        clock={() => 0}
      />,
      { session: signedIn({ tech: true }), path: "/tech/jobs/:id" },
    );
    expect(screen.getByTestId("job-payment")).toHaveTextContent("paying GH₵250.00 in cash");
    await userEvent.click(screen.getByRole("button", { name: "Confirm cash received" }));
    await waitFor(() => expect(payments.confirmCash).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "bk_1" })));
  });
});

describe("AdminPaymentsPage", () => {
  it("lists payments with commission and filters by status", async () => {
    const watchPays = staticWatch([payment({ id: "bk_a", status: "SUCCEEDED", method: "MOBILE_MONEY" }), payment({ id: "bk_b", method: "CASH", cashStatus: "AWAITING_TECHNICIAN" })]);
    renderWithAuth(<AdminPaymentsPage watchPays={watchPays} />, { session: signedIn({ admin: true }), path: "/admin/payments" });
    expect(screen.getByTestId("payment-bk_a")).toHaveTextContent("Paid");
    expect(screen.getByTestId("payment-bk_b")).toHaveTextContent("Waiting for payment");
    expect(screen.getByTestId("commission-total")).toHaveTextContent("GH₵37.50");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "FAILED");
    expect(watchPays).toHaveBeenLastCalledWith("FAILED", expect.any(Function), expect.any(Function));
  });
});
