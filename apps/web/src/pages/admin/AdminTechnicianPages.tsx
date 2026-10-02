import { ID_DOCUMENT_LABELS, VerificationStatus } from "@serviceflow/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ReviewActions } from "../../features/technician/ReviewActions";
import { FullPageSpinner } from "../../lib/auth/guards";
import {
  type Technician,
  type TechnicianStore,
  type Verification,
  documentUrl,
  technicianStore,
  watchTechniciansByStatus,
  watchVerification,
} from "../../lib/technician/technician-store";

interface AdminTechDeps {
  store?: Pick<TechnicianStore, "review">;
  watchTechnicians?: typeof watchTechniciansByStatus;
  watchSubmission?: typeof watchVerification;
  loadUrl?: typeof documentUrl;
}

function useTechnicians(status: VerificationStatus | "ALL", watch: typeof watchTechniciansByStatus) {
  const [list, setList] = useState<Technician[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => watch(status, setList, () => setError("We couldn't load technicians. Check your connection.")), [status, watch]);
  return { list, error };
}

/** Verification queue: pending submissions with their private documents. */
export function AdminVerificationPage({
  store = technicianStore,
  watchTechnicians = watchTechniciansByStatus,
  watchSubmission = watchVerification,
  loadUrl = documentUrl,
}: AdminTechDeps = {}) {
  const { list, error } = useTechnicians(VerificationStatus.PENDING, watchTechnicians);
  if (error) return <p role="alert" className="mx-auto max-w-4xl px-4 py-10 text-ink-700">{error}</p>;
  if (!list) return <FullPageSpinner />;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Verification</h1>
        <p className="mt-1 text-ink-600">Check each provider's ID against their selfie before approving. Rejections need a reason.</p>
      </div>
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 p-8 text-center text-ink-600">No submissions waiting for review.</p>
      ) : (
        <ul className="space-y-4">
          {list.map((t) => (
            <li key={t.id} data-testid={`pending-${t.id}`} className="rounded-xl border border-ink-100 bg-white p-5">
              <SubmissionReview technician={t} store={store} watchSubmission={watchSubmission} loadUrl={loadUrl} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubmissionReview({
  technician,
  store,
  watchSubmission,
  loadUrl,
}: {
  technician: Technician;
  store: Pick<TechnicianStore, "review">;
  watchSubmission: typeof watchVerification;
  loadUrl: typeof documentUrl;
}) {
  const [submission, setSubmission] = useState<Verification | null | undefined>(undefined);
  const [urls, setUrls] = useState<{ id?: string; selfie?: string }>({});
  const id = technician.latestVerificationId;

  useEffect(() => (id ? watchSubmission(id, setSubmission, () => setSubmission(null)) : undefined), [id, watchSubmission]);
  useEffect(() => {
    if (!submission) return;
    let cancelled = false;
    Promise.all([loadUrl(submission.idPhotoPath), submission.selfiePath ? loadUrl(submission.selfiePath) : Promise.resolve(undefined)])
      .then(([idUrl, selfieUrl]) => !cancelled && setUrls({ id: idUrl, selfie: selfieUrl }))
      .catch(() => !cancelled && setUrls({}));
    return () => {
      cancelled = true;
    };
  }, [submission, loadUrl]);

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium text-ink-900">{technician.displayName}</p>
        <p className="text-sm text-ink-600">
          {technician.yearsExperience} years · {technician.serviceIds.join(", ")} · {technician.serviceAreas.map((a) => a.name).join(", ")}
        </p>
      </div>
      {submission === undefined ? (
        <p className="text-sm text-ink-500">Loading submission…</p>
      ) : !submission ? (
        <p className="text-sm text-danger">Submission not found.</p>
      ) : (
        <>
          <p className="text-sm text-ink-800">
            {ID_DOCUMENT_LABELS[submission.idType]}: <span className="font-mono">{submission.idNumber}</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <DocumentImage label="ID photo" url={urls.id} />
            <DocumentImage label="Selfie" url={urls.selfie} />
          </div>
          <ReviewActions technicianId={technician.id} decisions={["APPROVE", "REJECT"]} store={store} />
        </>
      )}
    </div>
  );
}

function DocumentImage({ label, url }: { label: string; url?: string }) {
  return (
    <figure className="rounded-lg border border-ink-100 p-2">
      {url ? <img src={url} alt={label} className="h-48 w-full rounded object-contain" /> : <div className="h-48 animate-pulse rounded bg-ink-50" />}
      <figcaption className="mt-1 text-xs text-ink-500">{label}</figcaption>
    </figure>
  );
}

const STATUS_FILTERS: Array<VerificationStatus | "ALL"> = ["ALL", "PENDING", "VERIFIED", "SUSPENDED", "REJECTED", "UNSUBMITTED"];

/** All providers, filterable by status, with suspend/reinstate. */
export function AdminTechniciansPage({ store = technicianStore, watchTechnicians = watchTechniciansByStatus }: AdminTechDeps = {}) {
  const [filter, setFilter] = useState<VerificationStatus | "ALL">("ALL");
  const { list, error } = useTechnicians("ALL", watchTechnicians);
  if (error) return <p role="alert" className="mx-auto max-w-4xl px-4 py-10 text-ink-700">{error}</p>;
  if (!list) return <FullPageSpinner />;
  const shown = filter === "ALL" ? list : list.filter((t) => t.verificationStatus === filter);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Technicians</h1>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-sm ${filter === s ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-700"}`}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-ink-600">No technicians in this list.</p>
      ) : (
        <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white">
          {shown.map((t) => (
            <li key={t.id} data-testid={`technician-${t.id}`} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/admin/technicians/${t.id}`} className="font-medium text-brand-700 hover:text-brand-800">
                  {t.displayName}
                </Link>
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700">{t.verificationStatus.toLowerCase()}</span>
                {t.isOnline && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">online</span>}
              </div>
              <p className="text-sm text-ink-600">
                {t.serviceIds.join(", ") || "No services yet"} · {t.serviceAreas.map((a) => a.name).join(", ") || "No areas yet"} · ★{" "}
                {t.stats.avgRating.toFixed(1)} ({t.stats.completed} jobs)
              </p>
              {t.verificationStatus === VerificationStatus.VERIFIED && <ReviewActions technicianId={t.id} decisions={["SUSPEND"]} store={store} />}
              {t.verificationStatus === VerificationStatus.SUSPENDED && <ReviewActions technicianId={t.id} decisions={["REINSTATE"]} store={store} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
