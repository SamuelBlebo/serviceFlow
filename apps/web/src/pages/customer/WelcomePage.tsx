import { type AddressValues, customerProfileInput } from "@serviceflow/shared";
import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { AuthCard, Button, TextField } from "../../components/ui";
import { AddressForm } from "../../features/profile/AddressForm";
import { useAuth } from "../../lib/auth/AuthProvider";
import { FullPageSpinner, safeNextPath } from "../../lib/auth/guards";
import { messageFromError } from "../../lib/errors";
import { useCustomerProfile } from "../../lib/profile/CustomerProfileProvider";
import type { ServiceArea } from "../../lib/profile/customer-store";

/**
 * One-time welcome step after the first sign-in: the customer's name and,
 * optionally, their main address. Creates `customers/{uid}` (and the first
 * address) in one batch.
 */
export function WelcomePage() {
  const { state, store } = useCustomerProfile();
  const { actions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Only same-site paths inside the customer area are valid destinations.
  const requested = safeNextPath((location.state as { from?: string } | null)?.from ?? null, "/app");
  const destination = requested.startsWith("/app") && !requested.startsWith("/app/welcome") ? requested : "/app";
  const [fullName, setFullName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [step, setStep] = useState<"name" | "address">("name");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (state.status === "loading") return <FullPageSpinner />;
  if (state.status === "error") return <p role="alert" className="mx-auto max-w-md px-4 py-16 text-ink-700">{state.message}</p>;
  if (state.customer) return <Navigate to={destination} replace />;
  const { uid, areas } = state;

  async function finish(address: { values: AddressValues; area: ServiceArea } | null) {
    setBusy(true);
    setServerError(null);
    try {
      await store.createCustomerProfile(uid, fullName.trim().replace(/\s+/g, " "), address);
      navigate(destination, { replace: true });
    } catch (err) {
      setServerError(messageFromError(err));
      setBusy(false);
    }
  }

  async function signOut() {
    navigate("/", { replace: true }); // leave the guarded area first (see AreaLayout)
    await actions.signOut();
  }

  function continueFromName(event: FormEvent) {
    event.preventDefault();
    const parsed = customerProfileInput.safeParse({ fullName });
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? "Enter your name");
      return;
    }
    setNameError(null);
    setStep("address");
  }

  if (step === "name") {
    return (
      <AuthCard title="Welcome to ServiceFlow" subtitle="What should technicians call you?">
        <form onSubmit={continueFromName} noValidate className="space-y-5">
          <TextField
            label="Full name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            error={nameError}
            autoFocus
          />
          <Button type="submit" className="w-full">
            Continue
          </Button>
        </form>
        <SignOutLink onSignOut={signOut} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Where do you usually need help?" subtitle="Save your main address now, or add it later from your profile.">
      <AddressForm
        areas={areas}
        submitLabel="Save and continue"
        busy={busy}
        serverError={serverError}
        onSubmit={(values, area) => void finish({ values, area })}
      />
      <div className="mt-4 text-center">
        <Button variant="ghost" onClick={() => void finish(null)} disabled={busy}>
          Skip for now
        </Button>
      </div>
      <SignOutLink onSignOut={signOut} />
    </AuthCard>
  );
}

/** A user who signed in with the wrong number must be able to leave the welcome step. */
function SignOutLink({ onSignOut }: { onSignOut(): Promise<void> }) {
  return (
    <p className="mt-6 text-center text-sm text-ink-600">
      Wrong number?{" "}
      <button type="button" onClick={() => void onSignOut()} className="font-medium text-brand-700 hover:text-brand-800">
        Sign out
      </button>
    </p>
  );
}
