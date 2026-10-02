import { BookingActor, BookingStatus, isOpenBooking } from "@serviceflow/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { CancelPanel, ConfirmPanel, Detail, QuotePanel, StatusBadge, Timeline, priceText, whenText } from "../../features/bookings/BookingParts";
import { RequestForm, type RequestValues } from "../../features/bookings/RequestForm";
import { type Service, watchActiveServices } from "../../lib/admin/catalogue-store";
import { FullPageSpinner } from "../../lib/auth/guards";
import {
  type Booking,
  type BookingStore,
  type HistoryEntry,
  bookingStore,
  watchBooking,
  watchHistory,
  watchMyBookings,
} from "../../lib/bookings/booking-store";
import { messageFromError } from "../../lib/errors";
import { useCustomerProfile } from "../../lib/profile/CustomerProfileProvider";
import { newRequestId } from "../../lib/request-id";

/** Watchers and store are injectable so the pages render in tests without Firebase. */
export interface BookingPageDeps {
  store?: BookingStore;
  watchServices?: typeof watchActiveServices;
  watchMine?: typeof watchMyBookings;
  watchOne?: typeof watchBooking;
  watchSteps?: typeof watchHistory;
}

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
      {children}
    </div>
  );
}

const Failure = ({ message }: { message: string }) => (
  <p role="alert" className="mx-auto max-w-3xl px-4 py-10 text-ink-700">
    {message}
  </p>
);

/** The signed-in customer's own bookings (excludes jobs where they are the technician). */
export function useMyBookings(uid: string | null, watch: typeof watchMyBookings = watchMyBookings) {
  const [list, setList] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) return;
    return watch(
      uid,
      (all) => setList(all.filter((b) => b.customerId === uid)),
      () => setError("We couldn't load your bookings. Check your connection."),
    );
  }, [uid, watch]);
  return { list, error };
}

/** `/app/request` — what, where, when → a new booking. */
export function RequestServicePage({ store = bookingStore, watchServices = watchActiveServices }: BookingPageDeps = {}) {
  const { state } = useCustomerProfile();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [services, setServices] = useState<Service[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // One idempotency key per request attempt: a retry after a dropped
  // connection returns the booking already created instead of a second one.
  const [requestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => watchServices(setServices, () => setLoadError("We couldn't load services. Check your connection.")), [watchServices]);

  if (loadError) return <Failure message={loadError} />;
  if (state.status !== "ready" || !state.customer || !services) return <FullPageSpinner />;

  async function submit(values: RequestValues) {
    setBusy(true);
    setError(null);
    try {
      const { id } = await store.create({ requestId, ...values, channel: "WEB" });
      navigate(`/app/bookings/${id}`, { replace: true });
    } catch (e) {
      setError(messageFromError(e));
      setBusy(false);
    }
  }

  return (
    <Page title="Request a service">
      <RequestForm
        services={services}
        addresses={state.addresses}
        defaultAddressId={state.customer.defaultAddressId}
        initialServiceId={params.get("service") ?? undefined}
        busy={busy}
        serverError={error}
        onSubmit={(v) => void submit(v)}
      />
    </Page>
  );
}

function BookingRow({ booking }: { booking: Booking }) {
  return (
    <li>
      <Link
        to={`/app/bookings/${booking.id}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white px-5 py-4 hover:border-brand-200"
        data-testid={`booking-${booking.id}`}
      >
        <span>
          <span className="block font-medium text-ink-900">{booking.serviceSnapshot.name}</span>
          <span className="text-sm text-ink-500">
            {whenText(booking)} · {booking.location.address ?? "Shared location"}
          </span>
        </span>
        <StatusBadge status={booking.status} />
      </Link>
    </li>
  );
}

/** `/app/bookings` — open and past bookings. */
export function BookingsPage({ watchMine = watchMyBookings }: BookingPageDeps = {}) {
  const { state } = useCustomerProfile();
  const { list, error } = useMyBookings(state.status === "ready" ? state.uid : null, watchMine);
  const [tab, setTab] = useState<"open" | "past">("open");
  if (error) return <Failure message={error} />;
  if (!list) return <FullPageSpinner />;
  const shown = list.filter((b) => (tab === "open" ? isOpenBooking(b.status) : !isOpenBooking(b.status)));

  return (
    <Page title="Your bookings">
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" className="inline-flex rounded-lg border border-ink-100 bg-white p-1">
          {(["open", "past"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === t ? "bg-brand-600 text-white" : "text-ink-700"}`}
            >
              {t === "open" ? "Open" : "Past"}
            </button>
          ))}
        </div>
        <Link to="/app/request" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Request a service
        </Link>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 p-8 text-center text-ink-600">
          {tab === "open" ? "No open bookings." : "No past bookings yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((b) => (
            <BookingRow key={b.id} booking={b} />
          ))}
        </ul>
      )}
    </Page>
  );
}

/** `/app/bookings/:id` — live status, price agreement, confirmation and cancellation. */
export function BookingDetailPage({ store = bookingStore, watchOne = watchBooking, watchSteps = watchHistory }: BookingPageDeps = {}) {
  const { id = "" } = useParams();
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fail = () => setError("We couldn't load this booking. Check your connection.");
    const unsubs = [watchOne(id, setBooking, fail), watchSteps(id, setHistory, fail)];
    return () => unsubs.forEach((u) => u());
  }, [id, watchOne, watchSteps]);

  if (error) return <Failure message={error} />;
  if (booking === undefined) return <FullPageSpinner />;
  if (booking === null) return <Failure message="Booking not found." />;

  const searching = booking.status === BookingStatus.REQUESTED || booking.status === BookingStatus.MATCHING;
  return (
    <Page title={booking.serviceSnapshot.name}>
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={booking.status} />
        {searching && <span className="text-sm text-ink-600">We'll show your technician here as soon as one accepts.</span>}
      </div>

      <QuotePanel booking={booking} store={store} />
      <ConfirmPanel booking={booking} store={store} />

      <section className="rounded-xl border border-ink-100 bg-white p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Problem">{booking.problemDescription}</Detail>
          <Detail label="Where">{booking.location.address ?? "Shared location"}</Detail>
          <Detail label="When">{whenText(booking)}</Detail>
          <Detail label="Price">{priceText(booking)}</Detail>
          {booking.technicianSnapshot && <Detail label="Technician">{booking.technicianSnapshot.displayName}</Detail>}
          {booking.cancellation && (
            <Detail label="Cancelled">
              {{ CUSTOMER: "By you", TECHNICIAN: "By the technician" }[booking.cancellation.actor] ?? "By ServiceFlow"} —{" "}
              {booking.cancellation.reason}
            </Detail>
          )}
        </dl>
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-ink-900">Progress</h2>
        <Timeline entries={history} viewer="customer" />
      </section>

      <CancelPanel booking={booking} actor={BookingActor.CUSTOMER} store={store} />
    </Page>
  );
}
