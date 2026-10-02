import {
  BookingActor,
  BookingStatus,
  type JobBucket,
  QuoteStatus,
  TECH_STEP_LABELS,
  canActorTransition,
  canSubmitQuote,
  formatMoney,
  formatMoneyRange,
  isQuoteWithinRange,
  jobBucket,
  nextTechnicianStep,
  toMinor,
} from "@serviceflow/shared";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Button, TextAreaField, TextField } from "../../components/ui";
import { useAuth } from "../../lib/auth/AuthProvider";
import { FullPageSpinner } from "../../lib/auth/guards";
import type { Booking, BookingContact } from "../../lib/bookings/booking-store";
import { messageFromError } from "../../lib/errors";
import { newRequestId } from "../../lib/request-id";
import { type JobStore, jobStore, watchJob, watchJobContact, watchMyJobs } from "../../lib/technician/job-store";

/** What the technician sees at each status. */
export const TECH_STATUS_LABELS: Record<BookingStatus, string> = {
  REQUESTED: "Looking for a technician",
  MATCHING: "Looking for a technician",
  OFFERED: "New job offer",
  ACCEPTED: "Accepted — set off when you're ready",
  EN_ROUTE: "On your way",
  ARRIVED: "On site",
  IN_PROGRESS: "Working",
  COMPLETED: "Finished — waiting for the customer to confirm",
  CUSTOMER_CONFIRMED: "Confirmed by the customer",
  PAID: "Paid",
  DISPUTED: "Under review by ServiceFlow",
  CANCELLED: "Cancelled",
};

export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [enabled]);
  return now;
}

const SECTIONS: Array<{ bucket: JobBucket; title: string }> = [
  { bucket: "offer", title: "New requests" },
  { bucket: "active", title: "Active" },
  { bucket: "upcoming", title: "Upcoming" },
  { bucket: "done", title: "Done" },
];

export interface TechJobDeps {
  store?: JobStore;
  watchJobs?: typeof watchMyJobs;
  watchOne?: typeof watchJob;
  watchContact?: typeof watchJobContact;
  clock?: () => number;
}

/** `/tech/jobs` — new requests with a countdown, then active, upcoming and done. */
export function TechJobsPage({ watchJobs = watchMyJobs, clock }: TechJobDeps = {}) {
  const { session } = useAuth();
  const uid = session.status === "signedIn" ? session.user.uid : "";
  const [jobs, setJobs] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ticking = useNow(!clock);
  const now = clock ? clock() : ticking;
  useEffect(() => (uid ? watchJobs(uid, setJobs, () => setError("We couldn't load your jobs.")) : undefined), [uid, watchJobs]);
  if (error) return <p role="alert" className="px-4 py-10">{error}</p>;
  if (!jobs) return <FullPageSpinner />;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Jobs</h1>
      {SECTIONS.map(({ bucket, title }) => {
        const list = jobs.filter((j) => jobBucket(j, uid) === bucket);
        if (list.length === 0 && bucket !== "offer") return null;
        return (
          <section key={bucket}>
            <h2 className="mb-3 font-semibold text-ink-900">{title}</h2>
            {list.length === 0 ? (
              <p className="text-ink-600">No new requests. Stay online to receive them.</p>
            ) : (
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white">
                {list.map((j) => {
                  const left = j.offerExpiresAt ? j.offerExpiresAt.toMillis() - now : 0;
                  return (
                    <li key={j.id}>
                      <Link to={`/tech/jobs/${j.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-ink-50" data-testid={`job-${j.id}`}>
                        <span>
                          <span className="block font-medium text-ink-900">{j.serviceSnapshot.name}</span>
                          <span className="text-sm text-ink-500">
                            {j.location.address ?? "Shared location"} · {formatMoneyRange(j.pricing.estimateMinMinor, j.pricing.estimateMaxMinor, j.pricing.currency)}
                          </span>
                        </span>
                        <span className="text-sm font-medium text-brand-800">{j.status === "OFFERED" && left > 0 ? `Answer within ${countdown(left)}` : TECH_STATUS_LABELS[j.status]}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function useAction() {
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: (requestId: string) => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn(requestId);
      setRequestId(newRequestId());
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

const Alert = ({ message }: { message: string | null }) =>
  message ? (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  ) : null;

/** `/tech/jobs/:id` — accept/decline, then one next step at a time (photos are added from the mobile app). */
export function TechJobDetailPage({ store = jobStore, watchOne = watchJob, watchContact = watchJobContact, clock }: TechJobDeps = {}) {
  const { id = "" } = useParams();
  const { session } = useAuth();
  const uid = session.status === "signedIn" ? session.user.uid : "";
  const [job, setJob] = useState<Booking | null | undefined>(undefined);
  const [contact, setContact] = useState<BookingContact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offer = useAction();
  const step = useAction();
  const quote = useAction();
  const cancel = useAction();
  const [declineReason, setDeclineReason] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const ticking = useNow(!clock && job?.status === "OFFERED");
  const now = clock ? clock() : ticking;

  useEffect(() => watchOne(id, setJob, () => setError("We couldn't load this job.")), [id, watchOne]);
  const status = job?.status;
  useEffect(() => (status ? watchContact(id, setContact) : undefined), [id, status, watchContact]);

  if (error) return <p role="alert" className="px-4 py-10">{error}</p>;
  if (job === undefined) return <FullPageSpinner />;
  if (!job || (job.technicianId !== uid && job.offeredTechnicianId !== uid)) return <p className="px-4 py-10">This job is no longer available to you.</p>;

  const p = job.pricing;
  const isOffer = job.status === BookingStatus.OFFERED && job.offeredTechnicianId === uid;
  const left = job.offerExpiresAt ? job.offerExpiresAt.toMillis() - now : 0;
  const next = job.technicianId === uid ? nextTechnicianStep(job.status) : null;
  const waitingForPrice = next === BookingStatus.IN_PROGRESS && p.quoteStatus !== QuoteStatus.ACCEPTED;

  function sendQuote(event: FormEvent) {
    event.preventDefault();
    const cedis = Number(amount);
    if (!Number.isFinite(cedis) || cedis <= 0) return quote.setError("Enter your price in cedis, e.g. 250");
    const minor = toMinor(cedis);
    if (!isQuoteWithinRange(minor, p)) return quote.setError(`Your price must be between ${formatMoneyRange(p.estimateMinMinor, p.estimateMaxMinor, p.currency)}.`);
    void quote.run((requestId) => store.submitQuote({ requestId, bookingId: job!.id, amountMinor: minor, note: note.trim() || undefined }));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <Link to="/tech/jobs" className="text-sm font-medium text-brand-700">
        ← All jobs
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{job.serviceSnapshot.name}</h1>
        <p className="mt-1 font-medium text-brand-800" data-testid="tech-status">
          {TECH_STATUS_LABELS[job.status]}
          {isOffer && (left > 0 ? ` · answer within ${countdown(left)}` : " · this offer has expired")}
        </p>
      </div>

      <section className="space-y-1 rounded-xl border border-ink-100 bg-white p-5 text-ink-800">
        <p>{job.problemDescription}</p>
        <p className="text-sm text-ink-600">
          {job.location.address ?? "Shared location"} ·{" "}
          {p.quoteStatus === QuoteStatus.ACCEPTED && p.quotedMinor !== null ? `${formatMoney(p.quotedMinor, p.currency)} agreed` : `${formatMoneyRange(p.estimateMinMinor, p.estimateMaxMinor, p.currency)} estimate`}
        </p>
      </section>

      {isOffer && (
        <section className="space-y-3 rounded-xl border border-brand-200 bg-brand-50 p-5">
          <div className="flex flex-wrap gap-2">
            <Button busy={offer.busy} disabled={left <= 0} onClick={() => void offer.run((requestId) => store.respondToOffer({ requestId, bookingId: job.id, accept: true }))}>
              Accept job
            </Button>
            <Button
              variant="secondary"
              busy={offer.busy}
              onClick={() => void offer.run((requestId) => store.respondToOffer({ requestId, bookingId: job.id, accept: false, reason: declineReason.trim() || undefined }))}
            >
              Decline
            </Button>
          </div>
          <TextField label="Reason if declining (optional)" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} maxLength={300} />
          <Alert message={offer.error} />
        </section>
      )}

      {job.technicianId === uid && contact && (
        <section className="space-y-1 rounded-xl border border-ink-100 bg-white p-5" data-testid="job-contact">
          <p className="font-medium text-ink-900">{contact.customerName || "Customer"}</p>
          {contact.customerPhone && (
            <a href={`tel:${contact.customerPhone}`} className="block font-medium text-brand-700">
              Call {contact.customerPhone}
            </a>
          )}
          {contact.directions && <p className="text-ink-700">{contact.directions}</p>}
          {contact.ghanaPostGps && <p className="text-ink-700">GhanaPost GPS: {contact.ghanaPostGps}</p>}
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${job.location.lat},${job.location.lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-block font-medium text-brand-700"
          >
            Open directions in Google Maps
          </a>
        </section>
      )}

      {job.technicianId === uid && (canSubmitQuote(job.status, p.quoteStatus) || p.quoteStatus !== QuoteStatus.NONE) && (
        <section className="space-y-3 rounded-xl border border-ink-100 bg-white p-5">
          <h2 className="font-semibold text-ink-900">Price</h2>
          {p.quoteStatus === QuoteStatus.PROPOSED && p.quotedMinor !== null && <p>Waiting for the customer to accept {formatMoney(p.quotedMinor, p.currency)}.</p>}
          {p.quoteStatus === QuoteStatus.REJECTED && (
            <p className="text-danger">The customer declined your price{p.quoteRejectionReason ? `: “${p.quoteRejectionReason}”` : ""}.</p>
          )}
          {p.quoteStatus === QuoteStatus.ACCEPTED && p.quotedMinor !== null && <p>Agreed price: {formatMoney(p.quotedMinor, p.currency)}.</p>}
          {canSubmitQuote(job.status, p.quoteStatus) && (
            <form onSubmit={sendQuote} noValidate className="grid gap-3 sm:grid-cols-2">
              <TextField label="Your price (GH₵)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} hint={`Between ${formatMoneyRange(p.estimateMinMinor, p.estimateMaxMinor, p.currency)}`} />
              <TextField label="What it covers (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
              <div className="sm:col-span-2">
                <Alert message={quote.error} />
                <Button type="submit" busy={quote.busy}>
                  {p.quoteStatus === QuoteStatus.PROPOSED ? "Update price" : "Send price"}
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      {next && (
        <section className="space-y-3">
          {next === BookingStatus.COMPLETED && <TextAreaField label="Notes for the customer (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />}
          {waitingForPrice && <p className="text-ink-600">Agree a price with the customer before you start the work.</p>}
          {(next === BookingStatus.ARRIVED || next === BookingStatus.IN_PROGRESS) && <p className="text-sm text-ink-500">Add before/after photos from the ServiceFlow app.</p>}
          <Button
            className="w-full py-3 text-base"
            busy={step.busy}
            disabled={waitingForPrice}
            onClick={() =>
              void step.run((requestId) =>
                store.advance({
                  requestId,
                  bookingId: job.id,
                  to: next as "EN_ROUTE" | "ARRIVED" | "IN_PROGRESS" | "COMPLETED",
                  notes: next === BookingStatus.COMPLETED ? notes.trim() || undefined : undefined,
                }),
              )
            }
          >
            {TECH_STEP_LABELS[next]}
          </Button>
          <Alert message={step.error} />
        </section>
      )}

      {job.technicianId === uid && canActorTransition(job.status, BookingStatus.CANCELLED, BookingActor.TECHNICIAN) && (
        <section className="space-y-2 rounded-xl border border-ink-100 bg-white p-5">
          <TextField label="Reason for cancelling" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={300} hint="Cancelling an accepted job counts against your record." />
          <Button
            variant="secondary"
            busy={cancel.busy}
            onClick={() => {
              if (cancelReason.trim().length < 3) return cancel.setError("Give a short reason");
              void cancel.run((requestId) => store.cancel({ requestId, bookingId: job.id, reason: cancelReason.trim() }));
            }}
          >
            Can't do this job
          </Button>
          <Alert message={cancel.error} />
        </section>
      )}
    </div>
  );
}

/** Provider dashboard card: the current job, then new requests waiting for an answer. */
export function TechJobsCard({ uid, watchJobs = watchMyJobs, clock }: { uid: string; watchJobs?: typeof watchMyJobs; clock?: () => number }) {
  const [jobs, setJobs] = useState<Booking[]>([]);
  const ticking = useNow(!clock);
  const now = clock ? clock() : ticking;
  useEffect(() => watchJobs(uid, setJobs, () => setJobs([])), [uid, watchJobs]);
  const active = jobs.find((j) => jobBucket(j, uid) === "active");
  const offers = jobs.filter((j) => jobBucket(j, uid) === "offer" && (j.offerExpiresAt?.toMillis() ?? 0) > now);
  return (
    <section className="space-y-3" data-testid="tech-jobs-card">
      {active && (
        <Link to={`/tech/jobs/${active.id}`} className="block rounded-xl border-2 border-brand-500 bg-white p-5 hover:bg-brand-50">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">Current job</span>
          <span className="block font-semibold text-ink-900">{active.serviceSnapshot.name}</span>
          <span className="text-sm text-ink-600">
            {TECH_STATUS_LABELS[active.status]} · {active.location.address ?? "Shared location"}
          </span>
        </Link>
      )}
      {offers.length > 0 && (
        <Link to={offers.length === 1 ? `/tech/jobs/${offers[0]!.id}` : "/tech/jobs"} className="block rounded-xl border-2 border-accent-400 bg-white p-5">
          <span className="font-semibold text-ink-900">
            {offers.length === 1 ? "1 new request" : `${offers.length} new requests`} · answer within{" "}
            {countdown(Math.min(...offers.map((o) => o.offerExpiresAt!.toMillis() - now)))}
          </span>
        </Link>
      )}
      {!active && offers.length === 0 && (
        <p className="rounded-xl border border-ink-100 bg-white p-5 text-ink-600">
          No current job. New requests appear here while you're online. <Link to="/tech/jobs" className="font-medium text-brand-700">All jobs</Link>
        </p>
      )}
    </section>
  );
}
