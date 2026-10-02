import { ID_DOCUMENT_LABELS, VerificationStatus, formatGhanaPhoneForDisplay } from "@serviceflow/shared";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Button, SelectField, TextAreaField, TextField } from "../../components/ui";
import { StatusBadge, priceText, whenText } from "../../features/bookings/BookingParts";
import { ReviewActions, isReauthRequired } from "../../features/technician/ReviewActions";
import {
  type Account,
  type AdminStore,
  type AuditEntry,
  type Customer,
  type CustomerAddress,
  type Kpis,
  adminStore,
  loadKpis,
  watchAccount,
  watchAuditLog,
  watchBookingsFor,
  watchCustomer,
  watchCustomerAddresses,
  watchCustomers,
  watchLiveBookings,
} from "../../lib/admin/admin-store";
import { FullPageSpinner } from "../../lib/auth/guards";
import type { Booking } from "../../lib/bookings/booking-store";
import { messageFromError } from "../../lib/errors";
import { newRequestId } from "../../lib/request-id";
import {
  type Technician,
  type TechnicianStore,
  type Verification,
  technicianStore,
  watchMyVerifications,
  watchTechnician,
} from "../../lib/technician/technician-store";

const dateTime = (ms: number) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Page({ title, back, children }: { title: string; back?: { to: string; label: string }; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      {back && (
        <Link to={back.to} className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← {back.label}
        </Link>
      )}
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
      {children}
    </div>
  );
}

/** Subscribes with an injectable watcher; returns [value, error]. */
function useWatch<T>(watch: (onData: (v: T) => void, onError: (e: Error) => void) => () => void, deps: unknown[]): [T | undefined, string | null] {
  const [value, setValue] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // Callers pass the inputs the watcher depends on as `deps`.
  useEffect(() => watch(setValue, () => setError("We couldn't load this. Check your connection.")), deps);
  return [value, error];
}

function BookingTable({ bookings, empty }: { bookings: Booking[]; empty: string }) {
  if (bookings.length === 0) return <p className="rounded-xl border border-dashed border-ink-200 p-6 text-center text-ink-600">{empty}</p>;
  return (
    <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white">
      {bookings.map((b) => (
        <li key={b.id}>
          <Link to={`/admin/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-ink-50" data-testid={`row-${b.id}`}>
            <span>
              <span className="font-medium text-ink-900">{b.serviceSnapshot.name}</span>
              <span className="block text-sm text-ink-500">
                {dateTime(b.createdAt.toMillis())} · {b.location.address ?? "Shared location"} · {whenText(b)}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <span className="text-sm text-ink-600">{priceText(b)}</span>
              <StatusBadge status={b.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────

/** `/admin` — headline numbers, the live bookings monitor and the work queues. */
export function AdminHomePage({ getKpis = loadKpis, watchLive = watchLiveBookings }: { getKpis?: typeof loadKpis; watchLive?: typeof watchLiveBookings } = {}) {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [live, liveError] = useWatch<Booking[]>((ok, fail) => watchLive(ok, fail), [watchLive]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      getKpis()
        .then((k) => !cancelled && setKpis(k))
        .catch(() => !cancelled && setKpiError("We couldn't load the numbers."));
    void refresh();
    const t = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [getKpis]);

  const tiles: Array<{ label: string; value?: number; to?: string }> = [
    { label: "Bookings today", value: kpis?.bookingsToday, to: "/admin/bookings" },
    { label: "Waiting for a technician", value: kpis?.waiting, to: "/admin/bookings" },
    { label: "Jobs in progress", value: kpis?.activeJobs },
    { label: "Technicians online", value: kpis?.techniciansOnline, to: "/admin/technicians" },
    { label: "Verifications to review", value: kpis?.pendingVerifications, to: "/admin/verification" },
  ];

  return (
    <Page title="Dashboard">
      {kpiError && <p role="alert" className="text-danger">{kpiError}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => {
          const body = (
            <>
              <span className="block text-2xl font-semibold text-ink-900" data-testid={`kpi-${t.label}`}>
                {t.value ?? "…"}
              </span>
              <span className="text-sm text-ink-600">{t.label}</span>
            </>
          );
          return t.to ? (
            <Link key={t.label} to={t.to} className="rounded-xl border border-ink-100 bg-white p-4 hover:border-brand-200">
              {body}
            </Link>
          ) : (
            <div key={t.label} className="rounded-xl border border-ink-100 bg-white p-4">
              {body}
            </div>
          );
        })}
      </div>
      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink-900">Live bookings</h2>
        {liveError ? <p role="alert">{liveError}</p> : !live ? <p className="text-ink-500">Loading…</p> : <BookingTable bookings={live} empty="No bookings in progress." />}
      </section>
    </Page>
  );
}

// ── Account status (suspend / reactivate) ───────────────────────────────

function AccountStatus({ uid, account, store }: { uid: string; account: Account; store: Pick<AdminStore, "suspendUser" | "reactivateUser"> }) {
  const suspended = account.status === "SUSPENDED";
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; reauth: boolean } | null>(null);

  async function submit() {
    if (reason.trim().length < 3) return setError({ message: "Give a reason for the audit log", reauth: false });
    setBusy(true);
    setError(null);
    try {
      await (suspended ? store.reactivateUser : store.suspendUser)({ requestId, uid, reason: reason.trim() });
      setRequestId(newRequestId());
      setOpen(false);
      setReason("");
    } catch (e) {
      setError({ message: messageFromError(e), reauth: isReauthRequired(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-ink-100 bg-white p-5" data-testid="account-status">
      <p className="text-ink-800">
        Account: <strong className={suspended ? "text-danger" : "text-brand-700"}>{suspended ? "suspended" : "active"}</strong>
        {suspended && account.suspension ? ` — ${account.suspension.reason}` : ""}
      </p>
      {open ? (
        <div className="mt-3 space-y-3">
          <TextAreaField label={suspended ? "Reason for reactivating" : "Reason for suspending"} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          {error &&
            (error.reauth ? (
              <p role="alert" className="text-sm text-danger">
                For your security, sign in again first.{" "}
                <Link to="/admin/login?reason=reauth" className="font-medium underline">
                  Sign in again
                </Link>
              </p>
            ) : (
              <p role="alert" className="text-sm text-danger">
                {error.message}
              </p>
            ))}
          <div className="flex gap-2">
            <Button busy={busy} onClick={() => void submit()}>
              {suspended ? "Reactivate account" : "Suspend account"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-3" variant="secondary" onClick={() => setOpen(true)}>
          {suspended ? "Reactivate…" : "Suspend…"}
        </Button>
      )}
    </section>
  );
}

// ── Customers ───────────────────────────────────────────────────────────

/** `/admin/customers` — newest first, filtered by name. */
export function AdminCustomersPage({ watchAll = watchCustomers }: { watchAll?: typeof watchCustomers } = {}) {
  const [list, error] = useWatch<Customer[]>((ok, fail) => watchAll(ok, fail), [watchAll]);
  const [search, setSearch] = useState("");
  if (error) return <p role="alert" className="px-4 py-10">{error}</p>;
  if (!list) return <FullPageSpinner />;
  const term = search.trim().toLowerCase();
  const shown = term ? list.filter((c) => c.fullName.toLowerCase().includes(term)) : list;
  return (
    <Page title="Customers">
      <div className="max-w-sm">
        <TextField label="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {shown.length === 0 ? (
        <p className="text-ink-600">No customers found.</p>
      ) : (
        <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white">
          {shown.map((c) => (
            <li key={c.id}>
              <Link to={`/admin/customers/${c.id}`} className="flex justify-between px-4 py-3 hover:bg-ink-50" data-testid={`customer-${c.id}`}>
                <span className="font-medium text-ink-900">{c.fullName}</span>
                <span className="text-sm text-ink-500">joined {dateTime(c.createdAt.toMillis())}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

export interface AdminPersonDeps {
  store?: Pick<AdminStore, "suspendUser" | "reactivateUser">;
  watchCustomerDoc?: typeof watchCustomer;
  watchAccountDoc?: typeof watchAccount;
  watchAddresses?: typeof watchCustomerAddresses;
  watchBookings?: typeof watchBookingsFor;
  watchTech?: typeof watchTechnician;
  watchVerifications?: typeof watchMyVerifications;
  reviewStore?: Pick<TechnicianStore, "review">;
}

/** `/admin/customers/:uid` — profile, contact, addresses, bookings, account status. */
export function AdminCustomerDetailPage({
  store = adminStore,
  watchCustomerDoc = watchCustomer,
  watchAccountDoc = watchAccount,
  watchAddresses = watchCustomerAddresses,
  watchBookings = watchBookingsFor,
}: AdminPersonDeps = {}) {
  const { uid = "" } = useParams();
  const [customer, e1] = useWatch<Customer | null>((ok, fail) => watchCustomerDoc(uid, ok, fail), [uid, watchCustomerDoc]);
  const [account, e2] = useWatch<Account | null>((ok, fail) => watchAccountDoc(uid, ok, fail), [uid, watchAccountDoc]);
  const [addresses] = useWatch<CustomerAddress[]>((ok, fail) => watchAddresses(uid, ok, fail), [uid, watchAddresses]);
  const [bookings] = useWatch<Booking[]>((ok, fail) => watchBookings("customerId", uid, ok, fail), [uid, watchBookings]);
  if (e1 || e2) return <p role="alert" className="px-4 py-10">{e1 ?? e2}</p>;
  if (customer === undefined || account === undefined) return <FullPageSpinner />;
  if (!customer || !account) return <Page title="Customer not found" back={{ to: "/admin/customers", label: "All customers" }}>{null}</Page>;

  return (
    <Page title={customer.fullName} back={{ to: "/admin/customers", label: "All customers" }}>
      <p className="text-ink-700">
        {account.phone ? formatGhanaPhoneForDisplay(account.phone) : "No phone"} · joined {dateTime(customer.createdAt.toMillis())}
        {account.capabilities.tech && (
          <>
            {" "}
            · also a provider —{" "}
            <Link to={`/admin/technicians/${uid}`} className="font-medium text-brand-700">
              provider profile
            </Link>
          </>
        )}
      </p>
      <AccountStatus uid={uid} account={account} store={store} />
      <section>
        <h2 className="mb-2 font-semibold text-ink-900">Addresses</h2>
        <ul className="space-y-1 text-ink-700">
          {(addresses ?? []).map((a) => (
            <li key={a.id}>
              <strong className="font-medium">{a.label}</strong> — {a.areaName}, {a.directions}
              {a.ghanaPostGps ? ` (${a.ghanaPostGps})` : ""}
              {a.id === customer.defaultAddressId ? " · default" : ""}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 font-semibold text-ink-900">Bookings</h2>
        {bookings ? <BookingTable bookings={bookings} empty="No bookings yet." /> : <p className="text-ink-500">Loading…</p>}
      </section>
    </Page>
  );
}

/** `/admin/technicians/:uid` — profile, stats, verification history, jobs, account status. */
export function AdminTechnicianDetailPage({
  store = adminStore,
  watchAccountDoc = watchAccount,
  watchBookings = watchBookingsFor,
  watchTech = watchTechnician,
  watchVerifications = watchMyVerifications,
  reviewStore = technicianStore,
}: AdminPersonDeps = {}) {
  const { uid = "" } = useParams();
  const [tech, e1] = useWatch<Technician | null>((ok, fail) => watchTech(uid, ok, fail), [uid, watchTech]);
  const [account] = useWatch<Account | null>((ok, fail) => watchAccountDoc(uid, ok, fail), [uid, watchAccountDoc]);
  const [verifications] = useWatch<Verification[]>((ok, fail) => watchVerifications(uid, ok, fail), [uid, watchVerifications]);
  const [jobs] = useWatch<Booking[]>((ok, fail) => watchBookings("technicianId", uid, ok, fail), [uid, watchBookings]);
  if (e1) return <p role="alert" className="px-4 py-10">{e1}</p>;
  if (tech === undefined) return <FullPageSpinner />;
  if (!tech) return <Page title="Technician not found" back={{ to: "/admin/technicians", label: "All technicians" }}>{null}</Page>;
  const s = tech.stats;
  const decided = s.completed + s.cancelled;

  return (
    <Page title={tech.displayName} back={{ to: "/admin/technicians", label: "All technicians" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-ink-100 px-3 py-1 text-sm font-medium text-ink-700">{tech.verificationStatus.toLowerCase()}</span>
        {tech.isOnline && <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-800">online</span>}
        {tech.activeBookingId && (
          <Link to={`/admin/bookings/${tech.activeBookingId}`} className="text-sm font-medium text-brand-700">
            current job
          </Link>
        )}
      </div>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Statistics">
        {[
          ["Rating", s.ratingCount ? `★ ${s.avgRating.toFixed(1)} (${s.ratingCount})` : "—"],
          ["Completed", String(s.completed)],
          ["Cancelled", String(s.cancelled)],
          ["Completion rate", decided ? `${Math.round((s.completed / decided) * 100)}%` : "—"],
          ["Response rate", s.offered ? `${Math.round((s.responded / s.offered) * 100)}%` : "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-ink-100 bg-white p-3">
            <span className="block font-semibold text-ink-900">{value}</span>
            <span className="text-sm text-ink-600">{label}</span>
          </div>
        ))}
      </section>
      <p className="text-ink-700">
        {tech.yearsExperience} years · {tech.serviceIds.join(", ") || "no services"} · {tech.serviceAreas.map((a) => a.name).join(", ") || "no areas"}
      </p>
      {tech.verificationStatus === VerificationStatus.VERIFIED && <ReviewActions technicianId={uid} decisions={["SUSPEND"]} store={reviewStore} />}
      {tech.verificationStatus === VerificationStatus.SUSPENDED && <ReviewActions technicianId={uid} decisions={["REINSTATE"]} store={reviewStore} />}
      {account && <AccountStatus uid={uid} account={account} store={store} />}
      <section>
        <h2 className="mb-2 font-semibold text-ink-900">Verification history</h2>
        <ul className="space-y-1 text-sm text-ink-700">
          {(verifications ?? []).map((v) => (
            <li key={v.id}>
              {dateTime(v.submittedAt.toMillis())} · {ID_DOCUMENT_LABELS[v.idType]} {v.idNumber} · {v.status.toLowerCase()}
              {v.reviewNotes ? ` — “${v.reviewNotes}”` : ""}
            </li>
          ))}
          {verifications?.length === 0 && <li>No submissions.</li>}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 font-semibold text-ink-900">Jobs</h2>
        {jobs ? <BookingTable bookings={jobs} empty="No jobs yet." /> : <p className="text-ink-500">Loading…</p>}
      </section>
    </Page>
  );
}

// ── Audit log ───────────────────────────────────────────────────────────

const TARGETS = ["ALL", "user", "technician", "service", "booking", "settings", "commissionRule", "serviceArea"] as const;

function changes(entry: AuditEntry): string {
  const keys = new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})]);
  return [...keys].map((k) => `${k}: ${JSON.stringify(entry.before?.[k] ?? null)} → ${JSON.stringify(entry.after?.[k] ?? null)}`).join("; ");
}

/** `/admin/audit` — every privileged action, newest first. */
export function AdminAuditPage({ watchLog = watchAuditLog }: { watchLog?: typeof watchAuditLog } = {}) {
  const [target, setTarget] = useState<(typeof TARGETS)[number]>("ALL");
  const [entries, error] = useWatch<AuditEntry[]>((ok, fail) => watchLog(target, ok, fail), [target, watchLog]);
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const shown = (entries ?? []).filter((e) => !term || `${e.actionType} ${e.targetId} ${e.adminUid} ${e.reason ?? ""}`.toLowerCase().includes(term));

  return (
    <Page title="Audit log">
      <div className="flex flex-wrap gap-4">
        <div className="w-56">
          <SelectField label="What changed" value={target} onChange={(e) => setTarget(e.target.value as (typeof TARGETS)[number])}>
            {TARGETS.map((t) => (
              <option key={t} value={t}>
                {t === "ALL" ? "Everything" : t}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="w-72">
          <TextField label="Search" placeholder="Action, id, admin or reason" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !entries ? (
        <FullPageSpinner />
      ) : shown.length === 0 ? (
        <p className="text-ink-600">No entries.</p>
      ) : (
        <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white text-sm">
          {shown.map((e) => (
            <li key={e.id} className="space-y-1 px-4 py-3" data-testid={`audit-${e.id}`}>
              <p>
                <strong className="font-medium text-ink-900">{e.actionType}</strong> · {e.targetType} <span className="font-mono">{e.targetId}</span>
              </p>
              <p className="text-ink-600">
                {dateTime(e.createdAtMs)} · by {e.adminUid}
                {e.reason ? ` · “${e.reason}”` : ""}
              </p>
              {changes(e) && <p className="font-mono text-xs text-ink-500">{changes(e)}</p>}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

