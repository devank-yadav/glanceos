import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "./api";
import { consumeIntended, navigate } from "./router";

export function AuthPage({
  mode,
  registrationOpen,
  emailReady = true,
  stay = false,
  onDone,
}: {
  mode: "login" | "register";
  registrationOpen: boolean;
  emailReady?: boolean;
  /** Re-authenticating in place (the session-expired overlay): keep the page you're on. */
  stay?: boolean;
  onDone: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pwRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const register = mode === "register";

  // The autoFocus attribute is unreliable on an element inserted after parse, so
  // focus the first field explicitly. Every sign-in otherwise starts with a click.
  useEffect(() => { firstRef.current?.focus(); }, [register]);

  const submit = async () => {
    if (busy) return; // guard against double-submit (Enter + click race)
    setBusy(true);
    setErr("");
    try {
      await api.post(
        register ? "/api/auth/register" : "/api/auth/login",
        register ? { name, email, password } : { email, password },
      );
      // Refresh first, THEN navigate: setStatus schedules Preact's re-render as a
      // microtask while hashchange is a task, so doing it this way round means the
      // logged-out Landing never paints between the two.
      await onDone();
      // Back to wherever they were actually headed when we interrupted them. Falls
      // back to "/" rather than leaving the hash on #/login — app.tsx maps a stale
      // #/login to Screens, which would silently change the post-login destination.
      if (!stay) navigate(consumeIntended() ?? "/");
    } catch (e) {
      // Inline, not a toast: a 6s message in the opposite corner is gone before
      // someone re-reading their password finds it, and it never says which field.
      setErr(String(e instanceof Error ? e.message : e));
      setBusy(false); // stay on the page to retry; on success we've navigated away
      const el = pwRef.current;
      if (el) { el.focus(); el.select(); }
    }
  };

  const ready = register ? name.trim() && email.includes("@") && password.length >= 8 : email.includes("@") && password.length > 0;
  // Why the button is dead, said out loud — only once they've started typing.
  const hint = !ready && password.length > 0 && register && password.length < 8 ? "Passwords need at least 8 characters." : "";

  return (
    <main class="auth-wrap">
      <div class="auth-card">
        <a class="brand-mark" href="#/">glanceos</a>
        <h1>{register ? "Create your account" : "Welcome back"}</h1>
        {register && !registrationOpen ? (
          <p class="muted">Registration is closed on this server. Ask the person running it for an account.</p>
        ) : (
          // A real form, so password managers get a submit event to hang "save this
          // password?" on and Enter works from every field — not just the last one.
          // method/action are belt-and-braces: if preventDefault ever fails to run,
          // a native GET would put the password in the URL, history and proxy logs.
          <form method="post" action="#" onSubmit={(e) => { e.preventDefault(); if (ready && !busy) submit(); }}>
            {register && (
              <label class="field">
                <span>Name</span>
                <input
                  ref={firstRef}
                  id="name"
                  name="name"
                  value={name}
                  autoComplete="name"
                  autoFocus
                  onInput={(e) => { setName((e.currentTarget as HTMLInputElement).value); if (err) setErr(""); }}
                />
              </label>
            )}
            <label class="field">
              <span>Email</span>
              <input
                ref={register ? undefined : firstRef}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus={!register}
                value={email}
                onInput={(e) => { setEmail((e.currentTarget as HTMLInputElement).value); if (err) setErr(""); }}
              />
            </label>
            <label class="field">
              <span>Password {register && <em>(min 8 characters)</em>}</span>
              <input
                ref={pwRef}
                id="password"
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                aria-invalid={err ? "true" : undefined}
                aria-describedby={err ? "auth-error" : undefined}
                value={password}
                onInput={(e) => { setPassword((e.currentTarget as HTMLInputElement).value); if (err) setErr(""); }}
              />
              {hint && <span class="field-hint">{hint}</span>}
            </label>
            {err && <p class="auth-error" id="auth-error" role="alert">{err}</p>}
            <button class="primary wide" type="submit" disabled={!ready || busy}>
              {busy ? (register ? "Creating account…" : "Logging in…") : register ? "Create account" : "Log in"}
            </button>
          </form>
        )}
        <p class="muted auth-switch">
          {register ? (
            <>Already have an account? <a href="#/login">Log in</a></>
          ) : (
            <>
              {/* No mail backend means the reset link is never sent, so the link is
                  hidden rather than leading to a form that quietly does nothing. */}
              {emailReady && <><a href="#/forgot">Forgot password?</a>{registrationOpen && " · "}</>}
              {registrationOpen && <>New here? <a href="#/register">Create an account</a></>}
            </>
          )}
        </p>
      </div>
    </main>
  );
}
