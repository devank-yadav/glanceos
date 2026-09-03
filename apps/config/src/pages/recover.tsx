import { useState } from "preact/hooks";
import { api } from "../api";
import { navigate } from "../router";

// Logged-out password recovery + email-verification landing. Plain centered cards,
// reusing the auth-screen chrome. All endpoints are inert without a mail backend.

export function ForgotPage({ emailReady = true }: { emailReady?: boolean }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    try { await api.post("/api/auth/forgot", { email: email.trim() }); } catch { /* always show the same result */ }
    setSent(true); setBusy(false);
  }
  // No mail backend configured — the stock single-container install. Sending someone
  // to an inbox that will never receive anything is how people lose their dashboard,
  // so say what's actually true and hand them the command that works.
  if (!emailReady) {
    return (
      <main class="auth-screen">
        <div class="auth-card">
          <h1 class="auth-title">Reset your password</h1>
          <p class="muted">This server has no mail backend, so it can&rsquo;t send you a reset link. You can reset the password directly on the machine running GlanceOS:</p>
          <pre class="auth-cmd">docker compose exec glanceos pnpm --filter @glanceos/server passwd you@example.com</pre>
          <p class="muted">It asks for the new password on the terminal (or generates one), and signs out every existing session for that account.</p>
          <p class="muted auth-switch"><a href="#/login">Back to log in</a></p>
        </div>
      </main>
    );
  }
  return (
    <main class="auth-screen">
      <div class="auth-card">
        <h1 class="auth-title">Reset your password</h1>
        {sent ? (
          <>
            <p class="muted">If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox.</p>
            <p class="muted auth-switch"><a href="#/login">Back to log in</a></p>
          </>
        ) : (
          <form onSubmit={submit}>
            <label class="field">
              <span class="field-label">Email</span>
              <input type="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} placeholder="you@company.com" autoComplete="email" />
            </label>
            <button class="primary wide" disabled={!email.includes("@") || busy} type="submit">{busy ? "Sending…" : "Send reset link"}</button>
            <p class="muted auth-switch"><a href="#/login">Back to log in</a></p>
          </form>
        )}
      </div>
    </main>
  );
}

export function ResetPage({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api.post("/api/auth/reset", { token, password }); setDone(true); }
    catch (x) { setErr(String(x instanceof Error ? x.message : x)); }
    setBusy(false);
  }
  return (
    <main class="auth-screen">
      <div class="auth-card">
        <h1 class="auth-title">Choose a new password</h1>
        {done ? (
          <>
            <p class="muted">Your password has been reset. You can log in with it now.</p>
            <button class="primary wide" onClick={() => navigate("/login")}>Go to log in</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <label class="field">
              <span class="field-label">New password</span>
              <input type="password" value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} placeholder="At least 8 characters" autoComplete="new-password" />
            </label>
            {err && <p class="auth-error">{err}</p>}
            <button class="primary wide" disabled={password.length < 8 || busy} type="submit">{busy ? "Saving…" : "Reset password"}</button>
          </form>
        )}
      </div>
    </main>
  );
}

export function VerifiedPage() {
  const expired = location.hash.includes("expired");
  return (
    <main class="auth-screen">
      <div class="auth-card" style={{ textAlign: "center" }}>
        <h1 class="auth-title">{expired ? "Link expired" : "Email verified"}</h1>
        <p class="muted">{expired ? "That verification link is no longer valid. Request a fresh one from your account settings." : "Thanks — your email address is confirmed."}</p>
        <button class="primary wide" onClick={() => navigate("/")}>Continue to GlanceOS</button>
      </div>
    </main>
  );
}
