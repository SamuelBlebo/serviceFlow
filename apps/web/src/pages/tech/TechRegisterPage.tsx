import { registerTechnicianInput } from "@serviceflow/shared";
import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { AuthCard, Button, TextField } from "../../components/ui";
import { useAuth } from "../../lib/auth/AuthProvider";
import { messageFromError } from "../../lib/errors";
import { newRequestId } from "../../lib/request-id";
import { type TechnicianStore, technicianStore } from "../../lib/technician/technician-store";

/** Become a service provider: grants the `tech` capability, then opens the provider area. */
export function TechRegisterPage({ store = technicianStore }: { store?: Pick<TechnicianStore, "register"> } = {}) {
  const { session, actions } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(session.status === "signedIn" ? (session.user.displayName ?? "") : "");
  const [years, setYears] = useState("0");
  const [requestId] = useState(newRequestId);
  const [errors, setErrors] = useState<{ displayName?: string; years?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session.status === "signedIn" && session.capabilities.tech) return <Navigate to="/tech" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = registerTechnicianInput.safeParse({ requestId, displayName, yearsExperience: Number(years) });
    if (!parsed.success || !/^\d{1,2}$/.test(years.trim())) {
      setErrors({
        displayName: parsed.error?.issues.find((i) => i.path[0] === "displayName")?.message,
        years: /^\d{1,2}$/.test(years.trim()) ? undefined : "Enter a number of years, e.g. 5",
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      await store.register(parsed.data);
      await actions.refreshSession(); // pick up the new `tech` claim
      navigate("/tech", { replace: true });
    } catch (err) {
      setServerError(messageFromError(err));
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Become a ServiceFlow provider" subtitle="Get jobs from customers near you. Registration takes a few minutes; we verify every provider before they receive jobs.">
      <form onSubmit={submit} noValidate className="space-y-5">
        <TextField label="Name customers will see" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} error={errors.displayName} />
        <TextField label="Years of experience" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} error={errors.years} />
        {serverError && (
          <p role="alert" className="text-sm text-danger">
            {serverError}
          </p>
        )}
        <Button type="submit" busy={busy} className="w-full">
          Register as a provider
        </Button>
      </form>
    </AuthCard>
  );
}
