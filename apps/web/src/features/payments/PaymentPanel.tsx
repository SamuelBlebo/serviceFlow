import {
  BookingStatus,
  CashStatus,
  MOBILE_MONEY_NETWORK_LABELS,
  MobileMoneyNetwork,
  PaymentMethod,
  PaymentStatus,
  formatGhanaPhoneForDisplay,
  formatMoney,
  initiatePaymentInput,
} from "@serviceflow/shared";
import { type FormEvent, useState } from "react";
import { Button, SelectField, TextField } from "../../components/ui";
import type { Booking } from "../../lib/bookings/booking-store";
import { messageFromError } from "../../lib/errors";
import type { Payment, PaymentStore } from "../../lib/payments/payment-store";
import { newRequestId } from "../../lib/request-id";

/**
 * The customer pays after confirming the job (plan §14). Mobile Money sends
 * a prompt to their phone; cash is paid to the technician, who confirms it.
 * Status comes only from the server-written payment document.
 */
export function PaymentPanel({
  booking,
  payment,
  cashAllowed,
  accountPhone,
  store,
  emulator = false,
}: {
  booking: Booking;
  payment: Payment | null;
  cashAllowed: boolean;
  accountPhone: string | null;
  store: PaymentStore;
  emulator?: boolean;
}) {
  const [method, setMethod] = useState<"MOBILE_MONEY" | "CASH">("MOBILE_MONEY");
  const [network, setNetwork] = useState<MobileMoneyNetwork>(MobileMoneyNetwork.MTN_MOMO);
  const [phone, setPhone] = useState(accountPhone ? formatGhanaPhoneForDisplay(accountPhone) : "");
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!payment) return null;
  const amount = formatMoney(payment.amountMinor, payment.currency);

  if (payment.status === PaymentStatus.SUCCEEDED || booking.status === BookingStatus.PAID) {
    return (
      <section className="rounded-xl border border-brand-200 bg-brand-50 p-5" data-testid="payment-panel">
        <h2 className="font-semibold text-ink-900">Paid {amount}</h2>
        <p className="mt-1 text-ink-700">{payment.method === PaymentMethod.CASH ? "Paid in cash — confirmed by your technician." : "Paid by Mobile Money."} Thank you!</p>
      </section>
    );
  }
  if (booking.status !== BookingStatus.CUSTOMER_CONFIRMED) return null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  function pay(event: FormEvent) {
    event.preventDefault();
    const input = { requestId, bookingId: booking.id, method, ...(method === PaymentMethod.MOBILE_MONEY ? { msisdn: phone, network } : {}) };
    const parsed = initiatePaymentInput.safeParse(input);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the details");
    void run(async () => {
      await store.initiate(input);
      setRequestId(newRequestId());
    });
  }

  const waitingForPhone = payment.status === PaymentStatus.PENDING && payment.method === PaymentMethod.MOBILE_MONEY && payment.attempts > 0;
  const waitingForCash = payment.status === PaymentStatus.PENDING && payment.method === PaymentMethod.CASH && payment.cashStatus === CashStatus.AWAITING_TECHNICIAN;

  return (
    <section className="space-y-4 rounded-xl border border-accent-400 bg-white p-5" data-testid="payment-panel">
      <h2 className="font-semibold text-ink-900">Pay {amount}</h2>

      {waitingForPhone && (
        <div className="rounded-lg bg-brand-50 p-4" data-testid="awaiting-approval">
          <p className="font-medium text-ink-900">Approve the payment prompt on your phone</p>
          <p className="text-sm text-ink-600">Enter your Mobile Money PIN to pay {amount}. This page updates by itself once it goes through.</p>
          {emulator && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-brand-200 pt-3">
              <span className="w-full text-xs font-medium uppercase tracking-wide text-ink-500">Local test sandbox</span>
              <Button variant="secondary" busy={busy} onClick={() => void run(() => store.simulateOutcome({ bookingId: booking.id, outcome: "SUCCEEDED" }))}>
                Simulate approval
              </Button>
              <Button variant="ghost" busy={busy} onClick={() => void run(() => store.simulateOutcome({ bookingId: booking.id, outcome: "FAILED" }))}>
                Simulate decline
              </Button>
            </div>
          )}
        </div>
      )}

      {waitingForCash ? (
        <p className="rounded-lg bg-brand-50 p-4 text-ink-800" data-testid="awaiting-cash">
          Pay <strong>{amount}</strong> in cash to your technician. The booking is marked paid once they confirm they've received it.
        </p>
      ) : (
        <>
          {payment.status === PaymentStatus.FAILED && (
            <p role="alert" className="text-sm text-danger">
              {payment.failureReason ?? "The payment didn't go through."} You can try again.
            </p>
          )}
          <form onSubmit={pay} noValidate className="space-y-4">
            <fieldset className="flex flex-wrap gap-3">
              <legend className="sr-only">How would you like to pay?</legend>
              <label className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2">
                <input type="radio" name="method" checked={method === "MOBILE_MONEY"} onChange={() => setMethod("MOBILE_MONEY")} />
                Mobile Money
              </label>
              {cashAllowed && (
                <label className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2">
                  <input type="radio" name="method" checked={method === "CASH"} onChange={() => setMethod("CASH")} />
                  Cash to the technician
                </label>
              )}
            </fieldset>
            {method === "MOBILE_MONEY" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label="Network" value={network} onChange={(e) => setNetwork(e.target.value as MobileMoneyNetwork)}>
                  {Object.values(MobileMoneyNetwork).map((n) => (
                    <option key={n} value={n}>
                      {MOBILE_MONEY_NETWORK_LABELS[n]}
                    </option>
                  ))}
                </SelectField>
                <TextField label="Mobile Money number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            )}
            <Button type="submit" busy={busy}>
              {method === "CASH" ? "I'll pay in cash" : waitingForPhone ? "Send a new prompt" : `Pay ${amount}`}
            </Button>
          </form>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
