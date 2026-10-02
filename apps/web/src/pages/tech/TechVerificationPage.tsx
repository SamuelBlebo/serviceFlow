import { ID_DOCUMENT_LABELS, VerificationStatus, canSubmitVerification } from "@serviceflow/shared";
import { useState } from "react";
import { Link } from "react-router";
import { Card } from "../../components/ui";
import { type VerificationValues, VerificationForm } from "../../features/technician/VerificationForm";
import { messageFromError } from "../../lib/errors";
import { newRequestId } from "../../lib/request-id";
import { useReadyTechnician } from "../../lib/technician/TechnicianProvider";

/** Submit identity documents; see the review outcome and history. */
export function TechVerificationPage() {
  const ready = useReadyTechnician();
  // One submission id per attempt: uploads and the callable share it, so a retry reuses the same folder.
  const [attempt, setAttempt] = useState(() => ({ requestId: newRequestId(), submissionId: newRequestId().replace("req_", "sub_") }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ready) return null;
  const { uid, technician, verifications, store } = ready;
  const status = technician.verificationStatus;
  const latest = verifications[0];
  const needsWorkSettings = technician.serviceIds.length === 0 || technician.serviceAreas.length === 0;

  async function submit(values: VerificationValues) {
    setBusy(true);
    setError(null);
    try {
      await store.submitVerification(uid, { ...attempt, ...values });
      setAttempt({ requestId: newRequestId(), submissionId: newRequestId().replace("req_", "sub_") });
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Verification</h1>

      {status === VerificationStatus.PENDING && (
        <p role="status" className="rounded-xl border border-ink-100 bg-ink-50 p-5 text-ink-800">
          Your documents were received and are being reviewed. We'll let you know the outcome.
        </p>
      )}
      {status === VerificationStatus.VERIFIED && (
        <p role="status" className="rounded-xl border border-brand-200 bg-brand-50 p-5 text-ink-800">
          You're verified. You can go online from your dashboard.
        </p>
      )}
      {status === VerificationStatus.SUSPENDED && (
        <p role="status" className="rounded-xl border border-accent-400 bg-accent-400/10 p-5 text-ink-800">
          Your provider account is suspended. Contact ServiceFlow support.
        </p>
      )}
      {status === VerificationStatus.REJECTED && latest?.reviewNotes && (
        <div role="alert" className="rounded-xl border border-accent-400 bg-accent-400/10 p-5">
          <p className="font-medium text-ink-900">We couldn't verify your last submission</p>
          <p className="mt-1 text-ink-700">Reason: {latest.reviewNotes}</p>
          <p className="mt-1 text-sm text-ink-600">Please submit new photos below.</p>
        </div>
      )}

      {canSubmitVerification(status) &&
        (needsWorkSettings ? (
          <p className="rounded-xl border border-ink-100 p-5 text-ink-700">
            First,{" "}
            <Link to="/tech/availability" className="font-medium text-brand-700 hover:text-brand-800">
              choose your services, areas and working hours
            </Link>
            .
          </p>
        ) : (
          <Card title="Your ID">
            <VerificationForm key={attempt.submissionId} busy={busy} serverError={error} onSubmit={(v) => void submit(v)} />
          </Card>
        ))}

      {verifications.length > 0 && (
        <Card title="Submission history">
          <ul className="divide-y divide-ink-100">
            {verifications.map((v) => (
              <li key={v.id} className="py-3 text-sm">
                <span className="font-medium text-ink-900">{ID_DOCUMENT_LABELS[v.idType]}</span>{" "}
                <span className="text-ink-600">· {v.status.toLowerCase()}</span>
                {v.reviewNotes && <p className="mt-0.5 text-ink-600">Reviewer note: {v.reviewNotes}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
