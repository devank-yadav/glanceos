import { useState } from "preact/hooks";
import { api } from "./api";
import { navigate } from "./router";

export function AuthPage({
  mode,
  registrationOpen,
  onDone,
}: {
  mode: "login" | "register";
  registrationOpen: boolean;
  onDone: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const register = mode === "register";

  const submit = async () => {
    setMessage("");
    try {
      await api.post(
        register ? "/api/auth/register" : "/api/auth/login",
        register ? { name, email, password } : { email, password },
      );
      navigate("/");
      await onDone();
    } catch (e) {
      setMessage(String(e instanceof Error ? e.message : e));
    }
  };

  const ready = register ? name.trim() && email.includes("@") && password.length >= 8 : email.includes("@") && password.length > 0;

  return (
    <main class="auth-wrap">
      <div class="auth-card">
        <div class="brand-mark">glanceos</div>
        <h1>{register ? "Create your account" : "Welcome back"}</h1>
        {register && !registrationOpen ? (
          <p class="muted">Registration is closed on this server. Ask the person running it for an account.</p>
        ) : (
          <>
            {register && (
              <label class="field">
                <span>Name</span>
                <input value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
              </label>
            )}
            <label class="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)}
              />
            </label>
            <label class="field">
              <span>Password {register && <em>(min 8 characters)</em>}</span>
              <input
                type="password"
                value={password}
                onInput={(e) => setPassword((e.currentTarget as HTMLInputElement).value)}
                onKeyDown={(e) => e.key === "Enter" && ready && submit()}
              />
            </label>
            <button class="primary wide" disabled={!ready} onClick={submit}>
              {register ? "Create account" : "Log in"}
            </button>
          </>
        )}
        {message && <p class="issues">{message}</p>}
        <p class="muted auth-switch">
          {register ? (
            <>Already have an account? <a href="#/login">Log in</a></>
          ) : (
            registrationOpen && (
              <>New here? <a href="#/register">Create an account</a></>
            )
          )}
        </p>
      </div>
    </main>
  );
}
