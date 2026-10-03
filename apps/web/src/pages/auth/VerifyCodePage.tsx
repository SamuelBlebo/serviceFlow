import { formatGhanaPhoneForDisplay } from "@serviceflow/shared";
import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { AuthCard, Button, TextField } from "../../components/ui";
import { useAuth } from "../../lib/auth/AuthProvider";
import { messageFromError } from "../../lib/errors";
import { call as defaultCall } from "../../lib/firebase/functions";
import type { VerifyState } from "./PhoneLoginPage";

/** Step 2 of phone sign-in: enter the code, receive a session. */
/** `callFn` is injectable for tests; production uses the typed callable client. */
export function VerifyCodePage({ callFn = defaultCall }: { callFn?: typeof defaultCall } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { actions } = useAuth();
  const initial = location.state as VerifyState | null;

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState(initial?.devCode);
  const [resendIn, setResendIn] = useState(initial?.resendInSeconds ?? 0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  if (!initial) return <Navigate to="/login" replace />;
  const { phone, next } = initial;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code we sent you");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { token } = await callFn("verifyOtp", { phone, code });
      await actions.signInWithToken(token);
      navigate(next, { replace: true });
    } catch (err) {
      setError(messageFromError(err));
      setBusy(false);
    }
  }

  async function resend() {
    setResending(true);
    setError(null);
    try {
      const result = await callFn("requestOtp", { phone });
      setResendIn(result.resendInSeconds);
      setDevCode(result.devCode);
      setCode("");
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthCard
      title="Enter your code"
      subtitle={
        <>
          Sent to <strong className="font-medium text-ink-900">{formatGhanaPhoneForDisplay(phone)}</strong>.{" "}
          <Link to="/login" className="font-medium text-brand-700 hover:text-brand-800">
            Change number
          </Link>
        </>
      }
    >
      {devCode && (
        <p className="mb-5 rounded-lg bg-accent-400/15 px-3 py-2 text-sm text-ink-700" data-testid="dev-code">
          Local emulator code: <strong className="font-mono">{devCode}</strong>
        </p>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <TextField
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          error={error}
          autoFocus
        />
        <Button type="submit" busy={busy} className="w-full">
          Verify and sign in
        </Button>
      </form>
      <div className="mt-4 text-center text-sm text-ink-600">
        {resendIn > 0 ? (
          <span>You can request a new code in {resendIn}s</span>
        ) : (
          <Button variant="ghost" onClick={resend} busy={resending}>
            Send a new code
          </Button>
        )}
      </div>
    </AuthCard>
  );
}
