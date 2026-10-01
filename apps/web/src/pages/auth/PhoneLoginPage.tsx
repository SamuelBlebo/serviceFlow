import { isValidGhanaPhone } from "@serviceflow/shared";
import { type FormEvent, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { AuthCard, Button, TextField } from "../../components/ui";
import { useAuth } from "../../lib/auth/AuthProvider";
import { safeNextPath } from "../../lib/auth/guards";
import { messageFromError } from "../../lib/errors";
import { call as defaultCall } from "../../lib/firebase/functions";

export interface VerifyState {
  phone: string;
  resendInSeconds: number;
  devCode?: string;
  next: string;
}

/** Step 1 of phone sign-in: enter a Ghanaian number, receive a code. */
/** `callFn` is injectable for tests; production uses the typed callable client. */
export function PhoneLoginPage({ callFn = defaultCall }: { callFn?: typeof defaultCall } = {}) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get("next"), "/app");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session.status === "signedIn") return <Navigate to={next} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValidGhanaPhone(phone)) {
      setError("Enter a valid Ghanaian phone number, e.g. 024 123 4567");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await callFn("requestOtp", { phone });
      const state: VerifyState = { phone: result.phone, resendInSeconds: result.resendInSeconds, devCode: result.devCode, next };
      navigate("/login/verify", { state });
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Sign in to ServiceFlow" subtitle="We'll text a 6-digit code to your phone. New here? This creates your account.">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <TextField
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="024 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={error}
          hint="MTN, Telecel and AirtelTigo numbers all work."
          autoFocus
        />
        <Button type="submit" busy={busy} className="w-full">
          Send code
        </Button>
      </form>
    </AuthCard>
  );
}
