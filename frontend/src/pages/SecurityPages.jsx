import { useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, LoaderCircle, MailCheck, ShieldCheck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";

function SecurityShell({ eyebrow = "ACCOUNT SECURITY", title, children }) {
  return (
    <main className="auth-shell security-shell">
      <section className="auth-card">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SecurityShell title="Reset your password">
      <p className="auth-copy">Enter the email address on your account and we’ll send a reset link.</p>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="reset-email">Email address</label>
        <input autoComplete="email" id="reset-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}
        <button className="primary-button auth-submit" disabled={busy} type="submit">{busy ? "Sending…" : "Send reset link"}</button>
      </form>
      <p className="auth-switch"><Link to="/login">Back to login</Link></p>
    </SecurityShell>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Your passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      const result = await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password })
      });
      setMessage(result.message);
      window.setTimeout(() => navigate("/login", { replace: true }), 1500);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SecurityShell title="Choose a new password">
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="new-password">New password</label>
        <input autoComplete="new-password" id="new-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
        <label htmlFor="confirm-new-password">Confirm password</label>
        <input autoComplete="new-password" id="confirm-new-password" minLength={8} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} />
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}
        <button className="primary-button auth-submit" disabled={busy || !token} type="submit">{busy ? "Saving…" : "Update password"}</button>
      </form>
      {!token && <p className="form-error" role="alert">This reset link is missing its token.</p>}
    </SecurityShell>
  );
}

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState(token ? "ready" : "error");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function verifyEmail() {
    setStatus("verifying");
    setError("");
    try {
      const result = await api("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token })
      });
      setMessage(result.message);
      setStatus("success");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("error");
    }
  }

  return (
    <main className="verify-page">
      <div aria-hidden="true" className="verify-orb verify-orb-one" />
      <div aria-hidden="true" className="verify-orb verify-orb-two" />
      <section aria-live="polite" className={`verify-card verify-${status}`}>
        <Link aria-label="Daymark home" className="verify-brand" to="/login">
          <span className="verify-brand-icon"><ShieldCheck size={21} /></span>
          <span>daymark<span>.</span></span>
        </Link>
        <div className="verify-state-icon" aria-hidden="true">
          {status === "success" ? <CheckCircle2 size={34} /> :
            status === "verifying" ? <LoaderCircle className="verify-spinner" size={34} /> :
              status === "error" ? <CircleAlert size={34} /> : <MailCheck size={34} />}
        </div>
        <p className="eyebrow">ACCOUNT SECURITY</p>
        <h1>{status === "success" ? "Email verified!" :
          status === "verifying" ? "Verifying your email…" :
            status === "error" ? "This link needs attention" : "One last step"}
        </h1>
        <p className="verify-description">
          {status === "success"
            ? "Your email is confirmed and your account is ready. You can now sign in and get started."
            : status === "verifying"
              ? "Please wait a moment while we securely confirm your email address."
              : status === "error"
                ? error || "This verification link is missing its token."
                : "Thanks for creating a Daymark account. Press the button below to confirm this email address."}
        </p>
        {status === "ready" && (
          <button className="primary-button verify-action" onClick={verifyEmail} type="button">
            Verify my email <ArrowRight size={17} />
          </button>
        )}
        {status === "verifying" && <div className="verify-progress"><span /></div>}
        {status === "success" && (
          <button className="primary-button verify-action" onClick={() => navigate("/login", { replace: true })} type="button">
            Continue to login <ArrowRight size={17} />
          </button>
        )}
        {status === "error" && <Link className="secondary-button verify-action" to="/login">Back to login</Link>}
        <p className="verify-footnote"><ShieldCheck size={14} /> Your account and personal tasks stay private.</p>
      </section>
    </main>
  );
}
