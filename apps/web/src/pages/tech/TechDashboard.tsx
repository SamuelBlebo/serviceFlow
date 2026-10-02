import { VerificationStatus, canGoOnline, firstName } from "@serviceflow/shared";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/ui";
import { messageFromError } from "../../lib/errors";
import { useReadyTechnician } from "../../lib/technician/TechnicianProvider";

const STATUS_COPY: Record<VerificationStatus, { title: string; body: string; tone: "info" | "good" | "warn" }> = {
  UNSUBMITTED: { title: "Finish your registration", body: "Complete the steps below so we can verify you and start sending you jobs.", tone: "info" },
  PENDING: { title: "We're reviewing your documents", body: "This usually takes 1–2 working days. You'll be able to go online once you're verified.", tone: "info" },
  VERIFIED: { title: "You're verified", body: "Go online to receive job requests near you.", tone: "good" },
  REJECTED: { title: "We couldn't verify you yet", body: "See the reason on the verification page and submit new documents.", tone: "warn" },
  SUSPENDED: { title: "Your provider account is suspended", body: "You can't receive jobs. Contact ServiceFlow support if you think this is a mistake.", tone: "warn" },
};

/** Provider home: verification status, onboarding checklist and the online switch. */
export function TechDashboard() {
  const ready = useReadyTechnician();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ready) return null;
  const { uid, technician, store } = ready;
  const status = technician.verificationStatus;
  const copy = STATUS_COPY[status];
  const hasWorkSettings = technician.serviceIds.length > 0 && technician.serviceAreas.length > 0;
  const submitted = status !== VerificationStatus.UNSUBMITTED && status !== VerificationStatus.REJECTED;

  async function toggleOnline() {
    setBusy(true);
    setError(null);
    try {
      await store.setOnline(uid, !technician.isOnline);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  const tone = { info: "border-ink-100 bg-ink-50", good: "border-brand-200 bg-brand-50", warn: "border-accent-400 bg-accent-400/10" }[copy.tone];

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Hello, {firstName(technician.displayName)}</h1>

      <section className={`rounded-xl border p-5 ${tone}`} data-testid="status-card">
        <h2 className="font-semibold text-ink-900">{copy.title}</h2>
        <p className="mt-1 text-ink-700">{copy.body}</p>
        {canGoOnline(status) && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${technician.isOnline ? "bg-brand-600 text-white" : "bg-ink-200 text-ink-700"}`}>
              {technician.isOnline ? "Online" : "Offline"}
            </span>
            <Button variant={technician.isOnline ? "secondary" : "primary"} busy={busy} onClick={() => void toggleOnline()}>
              {technician.isOnline ? "Go offline" : "Go online"}
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </section>

      {!canGoOnline(status) && status !== VerificationStatus.SUSPENDED && (
        <ol className="space-y-3">
          <ChecklistItem done label="Register as a provider" />
          <ChecklistItem done={hasWorkSettings} label="Choose your services, areas and working hours" to="/tech/availability" />
          <ChecklistItem done={submitted} label="Submit your ID for verification" to={hasWorkSettings ? "/tech/verification" : undefined} />
        </ol>
      )}
    </div>
  );
}

function ChecklistItem({ done, label, to }: { done: boolean; label: string; to?: string }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-ink-100 bg-white px-4 py-3">
      <span
        aria-hidden
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-brand-600 text-white" : "border border-ink-300 text-ink-400"}`}
      >
        {done ? "✓" : ""}
      </span>
      <span className={`flex-1 ${done ? "text-ink-500" : "text-ink-900"}`}>
        {label}
        <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
      </span>
      {!done && to && (
        <Link to={to} className="text-sm font-medium text-brand-700 hover:text-brand-800">
          Start
        </Link>
      )}
    </li>
  );
}
