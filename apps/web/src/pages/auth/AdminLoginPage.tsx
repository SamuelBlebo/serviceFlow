import { type FormEvent, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { AuthCard, Button, TextField } from "../../components/ui";
import { useAuth } from "../../lib/auth/AuthProvider";
import { safeNextPath } from "../../lib/auth/guards";
import { messageFromError } from "../../lib/errors";

/**
 * Administrator sign-in (email + password). Admin sessions last only for the
 * browser tab and end after inactivity. MFA is required before production
 * (plan §9.1, hardening stage).
 */
export function AdminLoginPage() {
  const { session, actions } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get("next"), "/admin");
  const idle = params.get("reason") === "idle";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session.status === "signedIn" && session.capabilities.admin) return <Navigate to={next} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email || !password) {
      setError("Enter your email and password");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const capabilities = await actions.signInAdmin(email.trim(), password);
      if (!capabilities.admin) {
        await actions.signOut();
        setError("This account isn't a ServiceFlow administrator.");
        setBusy(false);
        return;
      }
      navigate(next, { replace: true });
    } catch (err) {
      setError(messageFromError(err));
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Admin sign in"
      subtitle={idle ? "You were signed out after 30 minutes of inactivity. Sign in again to continue." : "For ServiceFlow staff only."}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <TextField label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
        <Button type="submit" busy={busy} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
