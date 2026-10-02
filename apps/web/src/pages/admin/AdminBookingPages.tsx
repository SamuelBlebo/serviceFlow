import { BOOKING_STATUS_LABELS, BookingActor, BookingStatus, canAdminSetPrice, formatMoney, toMinor } from "@serviceflow/shared";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Button, SelectField, TextAreaField, TextField } from "../../components/ui";
import { CancelPanel, Detail, JobRecord, StatusBadge, Timeline, priceText, whenText } from "../../features/bookings/BookingParts";
import { isReauthRequired } from "../../features/technician/ReviewActions";
import { FullPageSpinner } from "../../lib/auth/guards";
import {
  type Booking,
  type BookingContact,
  type BookingStore,
  type HistoryEntry,
  type JobPhoto,
  bookingStore,
  photoUrl,
  watchAdminBookings,
  watchBooking,
  watchContact,
  watchHistory,
  watchPhotos,
} from "../../lib/bookings/booking-store";
import { messageFromError } from "../../lib/errors";
import { newRequestId } from "../../lib/request-id";

export interface AdminBookingDeps {
  store?: BookingStore;
  watchList?: typeof watchAdminBookings;
  watchOne?: typeof watchBooking;
  watchSteps?: typeof watchHistory;
  watchPrivate?: typeof watchContact;
  watchJobPhotos?: typeof watchPhotos;
  loadUrl?: typeof photoUrl;
}

const dateTime = (ms: number) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** `/admin/bookings` — recent bookings, filterable by status. */
export function AdminBookingsPage({ watchList = watchAdminBookings }: AdminBookingDeps = {}) {
  const [status, setStatus] = useState<BookingStatus | "ALL">("ALL");
  const [list, setList] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setList(null);
    return watchList(status, setList, () => setError("We couldn't load bookings. Check your connection."));
  }, [status, watchList]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Bookings</h1>
        <div className="w-60">
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | "ALL")}>
            <option value="ALL">All statuses</option>
            {Object.values(BookingStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-ink-700">
          {error}
        </p>
      ) : !list ? (
        <FullPageSpinner />
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 p-8 text-center text-ink-600">No bookings.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-100 text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Where</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id} className="border-b border-ink-50 last:border-0" data-testid={`admin-booking-${b.id}`}>
                  <td className="px-4 py-3 text-ink-600">{dateTime(b.createdAt.toMillis())}</td>
                  <td className="px-4 py-3">
                    <Link to={`/admin/bookings/${b.id}`} className="font-medium text-brand-700 hover:text-brand-800">
                      {b.serviceSnapshot.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-700">{b.location.address ?? "Shared location"}</td>
                  <td className="px-4 py-3 text-ink-700">{b.status}</td>
                  <td className="px-4 py-3 text-ink-700">{priceText(b)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReauthHint() {
  return (
    <p role="alert" className="text-sm text-danger">
      For your security, sign in again to change prices.{" "}
      <Link to="/admin/login?reason=reauth" className="font-medium underline">
        Sign in again
      </Link>
    </p>
  );
}

/** Admin price override (any amount, reason required, audited; needs a recent sign-in). */
function SetPriceForm({ booking, store }: { booking: Booking; store: Pick<BookingStore, "setPrice"> }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; reauth: boolean } | null>(null);
  const [saved, setSaved] = useState(false);
  if (!canAdminSetPrice(booking.status)) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cedis = Number(amount);
    if (!Number.isFinite(cedis) || cedis <= 0) return setError({ message: "Enter the price in cedis, e.g. 250", reauth: false });
    if (reason.trim().length < 3) return setError({ message: "Give a reason for the audit log", reauth: false });
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await store.setPrice({ requestId, bookingId: booking.id, amountMinor: toMinor(cedis), reason: reason.trim() });
      setRequestId(newRequestId());
      setSaved(true);
      setAmount("");
      setReason("");
    } catch (e) {
      setError({ message: messageFromError(e), reauth: isReauthRequired(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-xl border border-ink-100 bg-white p-5">
      <h2 className="font-semibold text-ink-900">Set the price</h2>
      <p className="text-sm text-ink-600">Overrides the technician's quote and counts as agreed. Use when the job differs from the listed range.</p>
      <TextField label="Price (GH₵)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <TextAreaField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      {error && (error.reauth ? <ReauthHint /> : <p role="alert" className="text-sm text-danger">{error.message}</p>)}
      {saved && <p className="text-sm text-brand-700">Price updated.</p>}
      <Button type="submit" busy={busy}>
        Set price
      </Button>
    </form>
  );
}

function ReassignForm({ booking, store }: { booking: Booking; store: Pick<BookingStore, "reassign"> }) {
  const [reason, setReason] = useState("");
  const [requestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (booking.status !== BookingStatus.OFFERED) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) return setError("Give a reason for the audit log");
    setBusy(true);
    setError(null);
    try {
      await store.reassign({ requestId, bookingId: booking.id, reason: reason.trim() });
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-xl border border-ink-100 bg-white p-5">
      <h2 className="font-semibold text-ink-900">Take the offer back</h2>
      <p className="text-sm text-ink-600">Returns the job to matching so another technician can be found.</p>
      <TextAreaField label="Reason for reassigning" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} error={error} />
      <Button type="submit" variant="secondary" busy={busy}>
        Reassign
      </Button>
    </form>
  );
}

/** `/admin/bookings/:id` — everything about one booking, plus admin tools. */
export function AdminBookingDetailPage({
  store = bookingStore,
  watchOne = watchBooking,
  watchSteps = watchHistory,
  watchPrivate = watchContact,
  watchJobPhotos = watchPhotos,
  loadUrl = photoUrl,
}: AdminBookingDeps = {}) {
  const { id = "" } = useParams();
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [contact, setContact] = useState<BookingContact | null>(null);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fail = () => setError("We couldn't load this booking. Check your connection.");
    const unsubs = [watchOne(id, setBooking, fail), watchSteps(id, setHistory, fail), watchPrivate(id, setContact, fail), watchJobPhotos(id, setPhotos, () => setPhotos([]))];
    return () => unsubs.forEach((u) => u());
  }, [id, watchOne, watchSteps, watchPrivate, watchJobPhotos]);

  if (error) return <p role="alert" className="mx-auto max-w-4xl px-4 py-10 text-ink-700">{error}</p>;
  if (booking === undefined) return <FullPageSpinner />;
  if (booking === null) return <p className="mx-auto max-w-4xl px-4 py-10 text-ink-700">Booking not found.</p>;
  const p = booking.pricing;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link to="/admin/bookings" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← All bookings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
          {booking.serviceSnapshot.name} <span className="text-base font-normal text-ink-500">{booking.id}</span>
        </h1>
        <div className="mt-2 flex items-center gap-3">
          <StatusBadge status={booking.status} />
          <span className="text-sm text-ink-500">{BOOKING_STATUS_LABELS[booking.status]} · source {booking.source}</span>
        </div>
      </div>

      <section className="rounded-xl border border-ink-100 bg-white p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Problem">{booking.problemDescription}</Detail>
          <Detail label="When">{whenText(booking)}</Detail>
          <Detail label="Where">{booking.location.address ?? `${booking.location.lat}, ${booking.location.lng}`}</Detail>
          <Detail label="Customer">
            {contact ? `${contact.customerName || "—"} · ${contact.customerPhone ?? "no phone"}` : booking.customerId}
          </Detail>
          {contact?.directions && <Detail label="Directions">{contact.directions}</Detail>}
          <Detail label="Technician">
            {booking.technicianSnapshot?.displayName ?? (booking.offeredTechnicianId ? `Offered to ${booking.offeredTechnicianId}` : "None yet")}
          </Detail>
          <Detail label="Price">{priceText(booking)}</Detail>
          <Detail label="Quote">
            {p.quoteStatus}
            {p.quotedMinor !== null ? ` · ${formatMoney(p.quotedMinor, p.currency)}` : ""}
            {p.priceSetBy ? ` · set by ${p.priceSetBy.toLowerCase()}` : ""}
            {p.quoteRejectionReason ? ` · declined: “${p.quoteRejectionReason}”` : ""}
          </Detail>
          {p.commissionPercentSnapshot !== null && <Detail label="Commission">{p.commissionPercentSnapshot}%</Detail>}
          {booking.cancellation && <Detail label="Cancellation">{`${booking.cancellation.actor}: ${booking.cancellation.reason}`}</Detail>}
        </dl>
      </section>

      {booking.candidates.length > 0 && (
        <section className="rounded-xl border border-ink-100 bg-white p-5">
          <h2 className="font-semibold text-ink-900">Recommended technicians</h2>
          <ul className="mt-3 space-y-1 text-sm text-ink-700">
            {booking.candidates.map((c) => (
              <li key={c.technicianId}>
                {c.displayName} ({c.technicianId}) · score {c.score} · {c.distanceKm} km
                {booking.declinedTechnicianIds.includes(c.technicianId) ? " · declined" : ""}
                {booking.offeredTechnicianId === c.technicianId ? " · offered" : ""}
              </li>
            ))}
          </ul>
          {booking.matchingExpiresAt && ["REQUESTED", "MATCHING", "OFFERED"].includes(booking.status) && (
            <p className="mt-2 text-sm text-ink-500">Cancelled automatically if unmatched by {dateTime(booking.matchingExpiresAt.toMillis())}.</p>
          )}
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <SetPriceForm booking={booking} store={store} />
        <ReassignForm booking={booking} store={store} />
      </div>
      <CancelPanel booking={booking} actor={BookingActor.ADMIN} store={store} label="Cancel booking (admin)" />

      <JobRecord booking={booking} photos={photos} loadUrl={loadUrl} />

      <section>
        <h2 className="mb-3 font-semibold text-ink-900">History</h2>
        <Timeline entries={history} viewer="admin" />
      </section>
    </div>
  );
}
