import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { Icon } from "../editor/icons";

// Connect apps once here; bind blocks to them from the Studio's ⟿ Data tab.
// Tokens/URLs are sent once, encrypted server-side, and never returned.

const CAT_LABEL: Record<string, string> = {
  tasks: "Tasks", issues: "Issues", docs: "Docs & sheets", dev: "Developer", calendar: "Calendar", generic: "Generic", mail: "Mail",
};

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
  const [adding, setAdding] = useState<ProviderInfo | null>(null);
  const toast = useToast();

  const refresh = async () => {
    try {
      const [p, c] = await Promise.all([
        api.get<ProviderInfo[]>("/api/providers"),
        api.get<Connection[]>("/api/connections"),
      ]);
      setProviders(p);
      setConns(c);
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  useEffect(() => { refresh(); }, []);

  const remove = async (id: string) => {
    await api.del(`/api/connections/${id}`).catch(() => {});
    toast.success("Disconnected");
    refresh();
  };

  const cats = [...new Set((providers ?? []).map((p) => p.category))]
    .sort((a, b) => CAT_ORDER.indexOf(a) - CAT_ORDER.indexOf(b));

  return (
    <>
      <PageHeader title="Integrations" />
      <div class="shell-content">
        <p class="muted page-intro">
          Connect an app, then point any chart, stat, list, or calendar at it from the Studio's ⟿ Data tab.
          Tokens and secret URLs are encrypted on the server and never leave it.
        </p>

        {providers === null || conns === null ? (
          <div class="cards">{[0, 1, 2].map((i) => <div key={i} class="skeleton skeleton-card" />)}</div>
        ) : (
          <>
            <h2>Connected</h2>
            {conns.length === 0 ? (
              <EmptyState icon={<Icon.link />} title="No connections yet" body="Pick an app below to connect it." />
            ) : (
              <div class="cards">
                {conns.map((c) => (
                  <div class="card conn-card" key={c.id}>
                    <div class="row spread">
                      <h3 class="card-title">{c.label}</h3>
                      <span class={`chip conn-${c.status}`}>{c.status === "ok" ? "Connected" : c.status === "needs_auth" ? "Needs auth" : "Error"}</span>
                    </div>
                    <p class="muted">{c.provider} · {CAT_LABEL[c.category] ?? c.category}</p>
                    {c.lastError && <p class="conn-error-line">{c.lastError}</p>}
                    <button class="ghost" onClick={() => remove(c.id)}>Disconnect</button>
                  </div>
                ))}
              </div>
            )}

            <h2>Add a connection</h2>
            {cats.map((cat) => (
              <div key={cat} class="provider-cat">
                <div class="section-title">{CAT_LABEL[cat] ?? cat}</div>
                <div class="cards provider-grid">
                  {providers.filter((p) => p.category === cat).sort((a, b) => a.label.localeCompare(b.label)).map((p) => (
                    <button class="card provider-card" key={p.id} onClick={() => setAdding(p)}>
                      <strong>{p.label}</strong>
                      <span class="muted">{p.authKind === "oauth2" ? "OAuth" : p.authKind === "url" ? "URL" : p.authKind === "none" ? "No key" : "Token"}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        <Modal open={!!adding} onClose={() => setAdding(null)} title={adding ? `Connect ${adding.label}` : ""}>
          {adding && <AddForm provider={adding} onAdded={() => { setAdding(null); refresh(); }} />}
        </Modal>
      </div>
    </>
  );
}

function AddForm({ provider, onAdded }: { provider: ProviderInfo; onAdded: () => void }) {
  const [label, setLabel] = useState(provider.label);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const needsSecret = provider.authKind === "token" || provider.authKind === "url";

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/api/connections", { provider: provider.id, label, secret: secret || undefined });
      toast.success(`Connected ${provider.label}`);
      onAdded();
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  };

  return (
    <>
      {CONNECT_HELP[provider.id] && <p class="muted" style={{ marginTop: 0 }}>{CONNECT_HELP[provider.id]}</p>}
      {provider.authKind === "oauth2" && <p class="conn-error-line">OAuth sign-in needs your server admin to register an app first.</p>}
      <label class="field grow">
        <span>Label</span>
        <input value={label} maxLength={60} onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)} />
      </label>
      {needsSecret && (
        <label class="field grow">
          <span>{provider.authKind === "url" ? "URL" : "Token"}</span>
          <input type={provider.authKind === "url" ? "text" : "password"} value={secret} placeholder={SECRET_HINT[provider.authKind]} onInput={(e) => setSecret((e.currentTarget as HTMLInputElement).value)} />
        </label>
      )}
      <div class="row spread" style={{ marginTop: "4px" }}>
        <span />
        <button class="primary" disabled={busy || (needsSecret && !secret)} onClick={save}>{busy ? "Connecting…" : "Connect"}</button>
      </div>
    </>
  );
}
