import type { ReviewDecision } from "@serviceflow/shared";
import { useState } from "react";
import { Link } from "react-router";
import { Button, TextAreaField } from "../../components/ui";
import { messageFromError } from "../../lib/errors";
import { newRequestId } from "../../lib/request-id";
import type { TechnicianStore } from "../../lib/technician/technician-store";

/** True when the server asks for a fresh sign-in before a sensitive admin action. */
export function isReauthRequired(error: unknown): boolean {
  const e = error as { code?: string; details?: { code?: string } } | null;
  return e?.code === "functions/unauthenticated" && e.details?.code === "REAUTH_REQUIRED";
}

const LABELS: Record<ReviewDecision, { button: string; confirm: string; needsReason: boolean }> = {
  APPROVE: { button: "Approve", confirm: "Approve and verify", needsReason: false },
  REJECT: { button: "Reject", confirm: "Reject submission", needsReason: true },
  SUSPEND: { button: "Suspend", confirm: "Suspend provider", needsReason: true },
  REINSTATE: { button: "Reinstate", confirm: "Reinstate provider", needsReason: false },
};

/**
 * Admin decision buttons for one technician. Rejections and suspensions
 * require a reason (the technician sees it). One request id per decision, so
 * a retried click can't apply it twice.
 */
export function ReviewActions({
  technicianId,
  decisions,
  store,
  onDone,
}: {
  technicianId: string;
  decisions: ReviewDecision[];
  store: Pick<TechnicianStore, "review">;
  onDone?: (decision: ReviewDecision) => void;
}) {
  const [active, setActive] = useState<{ decision: ReviewDecision; requestId: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState(false);

  async function confirm() {
    if (!active) return;
    if (LABELS[active.decision].needsReason && notes.trim().length < 5) {
      setError("Explain the reason (the technician will see it)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await store.review({ requestId: active.requestId, technicianId, decision: active.decision, notes: notes.trim() || undefined });
      onDone?.(active.decision);
      setActive(null);
      setNotes("");
    } catch (err) {
      if (isReauthRequired(err)) setReauth(true);
      else setError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  if (reauth) {
    return (
      <p role="alert" className="text-sm text-ink-800">
        For your security, approving or suspending providers needs a recent sign-in.{" "}
        <Link to="/admin/login?reason=reauth" className="font-medium text-brand-700 hover:text-brand-800">
          Sign in again
        </Link>
      </p>
    );
  }

  if (!active) {
    return (
      <div className="flex flex-wrap gap-2">
        {decisions.map((d) => (
          <Button key={d} variant={d === "APPROVE" || d === "REINSTATE" ? "primary" : "secondary"} onClick={() => setActive({ decision: d, requestId: newRequestId() })}>
            {LABELS[d].button}
          </Button>
        ))}
      </div>
    );
  }

  const label = LABELS[active.decision];
  return (
    <div className="space-y-3 rounded-lg bg-ink-50 p-3">
      <TextAreaField
        label={label.needsReason ? "Reason (shown to the technician)" : "Note (optional)"}
        value={notes}
        maxLength={500}
        rows={2}
        onChange={(e) => setNotes(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button busy={busy} onClick={() => void confirm()}>
          {label.confirm}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => setActive(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
