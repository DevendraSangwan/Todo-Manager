import { useState } from "react";
import { ArrowRight, CheckCircle2, CircleCheck, Eye, EyeOff, ListTodo } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function AuthPage({ mode }) {
  const isRegister = mode === "register";
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (isRegister && password !== confirmPassword) {
      setError("Your passwords don’t match.");
      return;
    }

    setBusy(true);
    try {
      const { user } = await api(`/auth/${isRegister ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setUser(user);
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark"><ListTodo size={22} /></div>
        <p className="eyebrow">DAYMARK · YOUR STUDY SPACE</p>
        <h1>{isRegister ? "Make room for what matters." : "Welcome back."}</h1>
        <p className="auth-copy">
          {isRegister
            ? "A calmer way to keep track of classes, plans, and everything in between."
            : "Pick up where you left off and make today count."}
        </p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="email">Email address</label>
          <input
            autoComplete="email"
            id="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
          <label htmlFor="password">Password</label>
          <div className="password-field">
            <input
              autoComplete={isRegister ? "new-password" : "current-password"}
              id="password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isRegister ? "At least 8 characters" : "Your password"}
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="password-toggle"
              onClick={() => setShowPassword((visible) => !visible)}
              type="button"
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {isRegister && (
            <>
              <label htmlFor="confirm-password">Confirm password</label>
              <div className="password-field">
                <input
                  autoComplete="new-password"
                  id="confirm-password"
                  minLength={8}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Enter your password again"
                  required
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                />
                <button
                  aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
                  aria-pressed={showConfirmPassword}
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                  type="button"
                >
                  {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" disabled={busy} type="submit">
            {busy ? "Please wait…" : isRegister ? "Create account" : "Log in"}
            {!busy && <ArrowRight size={17} />}
          </button>
        </form>
        <p className="auth-switch">
          {isRegister ? "Already have an account?" : "New to Daymark?"}{" "}
          <Link to={isRegister ? "/login" : "/register"}>
            {isRegister ? "Log in" : "Create an account"}
          </Link>
        </p>
        <div className="auth-footnote">
          {isRegister ? <CheckCircle2 size={15} /> : <CircleCheck size={15} />}
          Your todo list is private to your account.
        </div>
      </section>
      <aside className="auth-aside">
        <div className="aside-orbit orbit-one" />
        <div className="aside-orbit orbit-two" />
        <div className="aside-content">
          <span className="aside-label">A LITTLE MORE FOCUS</span>
          <h2>Small steps.<br />Good days.</h2>
          <p>Keep your tasks close, your priorities clear, and your progress moving.</p>
          <div className="aside-note">
            <div className="note-check"><CheckCircle2 size={19} /></div>
            <div><strong>One thing at a time</strong><span>Make space for your next win.</span></div>
          </div>
        </div>
        <div className="aside-sparkle sparkle-a">✳</div>
        <div className="aside-sparkle sparkle-b">✳</div>
      </aside>
    </main>
  );
}
