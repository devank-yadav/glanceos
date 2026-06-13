import { useEffect, useState } from "preact/hooks";
import { api } from "../api";

// Connect apps once here; bind blocks to them from the Studio's ⟿ Data tab.
// Tokens/URLs are sent once, encrypted server-side, and never returned.

interface ProviderInfo {
  id: string;
  label: string;
  category: string;
  authKind: "none" | "url" | "token" | "apiKey" | "oauth2";
  resources: { id: string; label: string; shape: string }[];
}
interface Connection {
  id: string;
  provider: string;
  label: string;
  authKind: string;
  category: string;
  status: string;
  lastError: string;
  config: Record<string, unknown>;
}

const CAT_ORDER = ["tasks", "issues", "docs", "dev", "calendar", "generic", "mail"];
const SECRET_HINT: Record<string, string> = {
  token: "Personal API token (paste once — stored encrypted)",
  apiKey: "API key (optional — leave blank for public endpoints)",
  url: "The secret URL (e.g. a private .ics or published-CSV link)",
};
const CONNECT_HELP: Record<string, string> = {
  todoist: "Todoist → Settings → Integrations → Developer → API token",
  github: "github.com → Settings → Developer settings → Personal access token (read-only)",
  notion: "notion.so/my-integrations → New internal integration → share your database with it",
  linear: "Linear → Settings → API → Personal API key",
  ical: "Google/Apple/Outlook calendar → Settings → secret iCal (.ics) address",
  sheets: "Google Sheet → File → Share → Publish to web → CSV",
};

export function IntegrationsPage() {
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [conns, setConns] = useState<Connection[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<ProviderInfo | null>(null);

  const refresh = async () => {
    try {
      const [p, c] = await Promise.all([
        api.get<ProviderInfo[]>("/api/providers"),
        api.get<Connection[]>("/api/connections"),
      ]);
      setProviders(p);
      setConns(c);
      setError("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };
  useEffect(() => { refresh(); }, []);

  const remove = async (id: string) => {
    await api.del(`/api/connections/${id}`).catch(() => {});
    refresh();
  };

  if (providers === null || conns === null) return <p class="muted">Loading…</p>;

  const byCat = [...providers].sort((a, b) => (CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category)) || a.label.localeCompare(b.label));

  return (
    <>
      <h2>Integrations</h2>
      <p class="muted">
        Connect an app, then point any chart, stat, list, or calendar at it from the Studio’s ⟿ Data tab.
        Tokens and secret URLs are encrypted on the server and never leave it.
      </p>
      {error && <p class="issues">{error}</p>}

      {conns.length > 0 && (
        <>
          <div class="section-title">Connected</div>
          <div class="cards">
            {conns.map((c) => (
              <div class="card conn-card" key={c.id}>
                <div class="row spread">
                  <strong>{c.label}</strong>
                  <span class={`chip conn-${c.status}`}>{c.status === "ok" ? "Connected" : c.status === "needs_auth" ? "Needs auth" : "Error"}</span>
                </div>
                <p class="muted">{c.provider} · {c.category}</p>
                {c.lastError && <p class="issues">{c.lastError}</p>}
                <button class="ghost" onClick={() => remove(c.id)}>Disconnect</button>
              </div>
            ))}
          </div>
        </>
      )}

      <div class="section-title">Add a connection</div>
      <div class="cards provider-grid">
        {byCat.map((p) => (
          <button class="card provider-card" key={p.id} onClick={() => setAdding(p)}>
            <strong>{p.label}</strong>
            <span class="muted">{p.category}</span>
          </button>
        ))}
      </div>

      {adding && <AddDialog provider={adding} onClose={() => setAdding(null)} onAdded={() => { setAdding(null); refresh(); }} />}
    </>
  );
}

function AddDialog({ provider, onClose, onAdded }: { provider: ProviderInfo; onClose: () => void; onAdded: () => void }) {
  const [label, setLabel] = useState(provider.label);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const needsSecret = provider.authKind === "token" || provider.authKind === "url";

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await api.post("/api/connections", { provider: provider.id, label, secret: secret || undefined });
      onAdded();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  };

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Connect {provider.label}</h3>
        {CONNECT_HELP[provider.id] && <p class="muted">{CONNECT_HELP[provider.id]}</p>}
        {provider.authKind === "oauth2" && <p class="issues">OAuth sign-in needs your server admin to register an app first.</p>}
        <label class="field grow">
          <span>Label</span>
          <input value={label} onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)} />
        </label>
        {needsSecret && (
          <label class="field grow">
            <span>{provider.authKind === "url" ? "URL" : "Token"}</span>
            <input type={provider.authKind === "url" ? "text" : "password"} value={secret} placeholder={SECRET_HINT[provider.authKind]} onInput={(e) => setSecret((e.currentTarget as HTMLInputElement).value)} />
          </label>
        )}
        {err && <p class="issues">{err}</p>}
        <div class="row spread" style={{ marginTop: "12px" }}>
          <button class="ghost" onClick={onClose}>Cancel</button>
          <button disabled={busy || (needsSecret && !secret)} onClick={save}>{busy ? "Connecting…" : "Connect"}</button>
        </div>
      </div>
    </div>
  );
}
