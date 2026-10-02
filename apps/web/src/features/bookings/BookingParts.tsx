import {
  BOOKING_STATUS_LABELS,
  type BookingActor,
  BookingStatus,
  PreferredTime,
  QuoteStatus,
  canActorTransition,
  formatMoney,
  formatMoneyRange,
} from "@serviceflow/shared";
import { type ReactNode, useState } from "react";
import { Button, TextAreaField } from "../../components/ui";
import type { Booking, BookingStore, HistoryEntry } from "../../lib/bookings/booking-store";
import { messageFromError } from "../../lib/errors";
import { newRequestId } from "../../lib/request-id";

const TONE: Partial<Record<BookingStatus, string>> = {
  [BookingStatus.CANCELLED]: "bg-ink-100 text-ink-600",
  [BookingStatus.COMPLETED]: "bg-accent-400/20 text-ink-900",
  [BookingStatus.CUSTOMER_CONFIRMED]: "bg-brand-100 text-brand-800",
  [BookingStatus.PAID]: "bg-brand-100 text-brand-800",
  [BookingStatus.DISPUTED]: "bg-accent-400/20 text-ink-900",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${TONE[status] ?? "bg-brand-50 text-brand-800"}`}>
      {BOOKING_STATUS_LABELS[status]}
    </span>
  );
}

const dateTime = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function whenText(b: Pick<Booking, "preferredTime" | "scheduledAt">): string {
  if (b.preferredTime === PreferredTime.SCHEDULED && b.scheduledAt) return dateTime(b.scheduledAt.toMillis());
  return { ASAP: "As soon as possible", TODAY: "Later today", TOMORROW: "Tomorrow", SCHEDULED: "Scheduled" }[b.preferredTime];
}

/** The price line a customer or admin sees at each point. */
export function priceText(b: Booking): string {
  const p = b.pricing;
  if (p.finalMinor !== null) return `${formatMoney(p.finalMinor, p.currency)} (final)`;
  if (p.quoteStatus === QuoteStatus.ACCEPTED && p.quotedMinor !== null) return `${formatMoney(p.quotedMinor, p.currency)} (agreed)`;
  return `${formatMoneyRange(p.estimateMinMinor, p.estimateMaxMinor, p.currency)} (estimate)`;
}

export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-ink-900">{children}</dd>
    </div>
  );
}

const ACTOR_LABEL: Record<string, string> = { CUSTOMER: "You", TECHNICIAN: "Technician", ADMIN: "ServiceFlow", SYSTEM: "ServiceFlow" };

/** History reads as past events, not as the live prompts in BOOKING_STATUS_LABELS. */
const EVENT_LABELS: Partial<Record<BookingStatus, string>> = {
  [BookingStatus.REQUESTED]: "Booking requested",
  [BookingStatus.MATCHING]: "Looking for a technician",
  [BookingStatus.OFFERED]: "Offered to a technician",
  [BookingStatus.COMPLETED]: "Work completed",
  [BookingStatus.CUSTOMER_CONFIRMED]: "Completion confirmed",
};

/** Status history, oldest first. `viewer` decides whether the customer's own actions read "You". */
export function Timeline({ entries, viewer }: { entries: HistoryEntry[]; viewer: "customer" | "admin" }) {
  return (
    <ol className="space-y-3" aria-label="Booking history">
      {entries.map((h) => (
        <li key={h.id} className="flex gap-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
          <div>
            <p className="text-ink-900">{EVENT_LABELS[h.to] ?? BOOKING_STATUS_LABELS[h.to]}</p>
            <p className="text-sm text-ink-500">
              {dateTime(h.createdAt.toMillis())} · {viewer === "admin" ? h.actor : (ACTOR_LABEL[h.actor] ?? h.actor)}
              {h.note ? ` · “${h.note}”` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** One action at a time with a stable request id, so a retried click can't apply it twice. */
function useAction() {
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: (requestId: string) => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn(requestId);
      setRequestId(newRequestId());
      return true;
    } catch (e) {
      setError(messageFromError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

/** Shown when the technician has proposed a price (Decision D4). */
export function QuotePanel({ booking, store }: { booking: Booking; store: Pick<BookingStore, "respondToQuote"> }) {
  const action = useAction();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const p = booking.pricing;
  if (p.quoteStatus !== QuoteStatus.PROPOSED || p.quotedMinor === null) return null;

  const answer = (accept: boolean) => {
    if (!accept && reason.trim().length < 3) {
      action.setError("Tell the technician why (for example, too expensive)");
      return;
    }
    void action.run((requestId) =>
      store.respondToQuote({ requestId, bookingId: booking.id, accept, reason: accept ? undefined : reason.trim() }),
    );
  };

  return (
    <section className="rounded-xl border border-brand-200 bg-brand-50 p-5" data-testid="quote-panel">
      <h2 className="font-semibold text-ink-900">Your technician's price: {formatMoney(p.quotedMinor, p.currency)}</h2>
      {p.quoteNote && <p className="mt-1 text-ink-700">“{p.quoteNote}”</p>}
      <p className="mt-1 text-sm text-ink-600">Work starts only after you accept. You pay this amount when the job is done.</p>
      {declining ? (
        <div className="mt-4 space-y-3">
          <TextAreaField label="Why are you declining?" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          <div className="flex flex-wrap gap-2">
            <Button busy={action.busy} onClick={() => answer(false)}>
              Decline price
            </Button>
            <Button variant="ghost" onClick={() => setDeclining(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button busy={action.busy} onClick={() => answer(true)}>
            Accept price
          </Button>
          <Button variant="secondary" onClick={() => setDeclining(true)}>
            Decline
          </Button>
        </div>
      )}
      {action.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {action.error}
        </p>
      )}
    </section>
  );
}

/** Shown when the technician has marked the work completed. */
export function ConfirmPanel({ booking, store }: { booking: Booking; store: Pick<BookingStore, "confirm"> }) {
  const action = useAction();
  if (booking.status !== BookingStatus.COMPLETED) return null;
  return (
    <section className="rounded-xl border border-accent-400 bg-white p-5" data-testid="confirm-panel">
      <h2 className="font-semibold text-ink-900">Is the work done to your satisfaction?</h2>
      <p className="mt-1 text-ink-700">Confirming closes the job at {priceText(booking).replace(/ \(.+\)$/, "")}.</p>
      <Button className="mt-4" busy={action.busy} onClick={() => void action.run((requestId) => store.confirm({ requestId, bookingId: booking.id }))}>
        Confirm job completed
      </Button>
      {action.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {action.error}
        </p>
      )}
    </section>
  );
}

/**
 * Cancel with a reason. Rendered only when the state machine lets this
 * actor cancel now; the server decides again.
 */
export function CancelPanel({
  booking,
  actor,
  store,
  label = "Cancel booking",
}: {
  booking: Booking;
  actor: BookingActor;
  store: Pick<BookingStore, "cancel">;
  label?: string;
}) {
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!canActorTransition(booking.status, BookingStatus.CANCELLED, actor)) return null;

  const cancel = () => {
    if (reason.trim().length < 3) {
      action.setError("Give a short reason");
      return;
    }
    void action.run((requestId) => store.cancel({ requestId, bookingId: booking.id, reason: reason.trim() }));
  };

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-ink-100 bg-white p-5">
      <TextAreaField label="Reason for cancelling" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} error={action.error} />
      <div className="flex flex-wrap gap-2">
        <Button busy={action.busy} onClick={cancel}>
          Confirm cancellation
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Keep booking
        </Button>
      </div>
    </div>
  );
}
