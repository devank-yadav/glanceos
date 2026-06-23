import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { SettingsTabs } from "../components/SettingsTabs";
import { useToast } from "../components/Toast";
import { Icon } from "../editor/icons";

// Connect apps once here; bind blocks to them from the Studio's ⟿ Data tab.
// Tokens/URLs are sent once, encrypted server-side, and never returned.

const CAT_LABEL: Record<string, string> = {
  tasks: "Tasks", issues: "Issues", docs: "Docs & sheets", dev: "Developer", calendar: "Calendar",
  "smart-home": "Smart home", media: "Media", generic: "Generic", mail: "Mail",
  place: "Travel & place", health: "Health",
  social: "Social", books: "Books", gaming: "Gaming", sports: "Sports",
  finance: "Finance", news: "News", civic: "Civic & science", analytics: "Analytics", money: "Money",
  ops: "Observability", bookmarks: "Bookmarks", "time-tracking": "Time tracking",
};

interface ProviderInfo {
  id: string;
  label: string;
  category: string;
  authKind: "none" | "url" | "token" | "apiKey" | "oauth2";
  oauth: boolean;
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

const CAT_ORDER = ["tasks", "issues", "docs", "dev", "calendar", "smart-home", "media", "place", "health", "mail", "generic"];
const SECRET_HINT: Record<string, string> = {
  token: "Personal API token (paste once — stored encrypted)",
  apiKey: "API key (optional — leave blank for public endpoints)",
  url: "The secret URL (e.g. a private .ics or published-CSV link)",
};
const CONNECT_HELP: Record<string, string> = {
  todoist: "Todoist → Settings → Integrations → Developer → API token",
  github: "GitHub → Settings → Developer settings → OAuth Apps → New OAuth App; add the redirect URI below, then paste the client id/secret.",
  notion: "notion.so/my-integrations → New integration → set it Public (OAuth); add the redirect URI below, then paste the client id/secret. Share each database with the integration.",
  linear: "Linear → Settings → API → Personal API key",
  ical: "Google/Apple/Outlook calendar → Settings → secret iCal (.ics) address",
  sheets: "Google Sheet → File → Share → Publish to web → CSV",
  google: "Google Cloud Console → create an OAuth client (Web app), enable the Calendar API, then paste the client id/secret below.",
  homeassistant: "Home Assistant → your profile → Long-lived access tokens → Create token.",
  microsoft: "Azure Portal → App registrations → New registration; add the redirect URI below + the Calendars.Read delegated permission, then paste the client id/secret.",
  spotify: "developer.spotify.com → Dashboard → Create app; add the redirect URI below, then paste the client id/secret.",
  asana: "Asana → My settings → Apps → Manage developer apps → Personal access token.",
  jira: "Atlassian → id.atlassian.com → Security → API tokens → Create. Use your account email + site URL below.",
  trello: "trello.com/app-key for the API key; click 'Token' on that page to generate the token below.",
  slack: "api.slack.com/apps → Create New App; add the redirect URI below + the channels:read/history scopes, then paste the client id/secret.",
};

// Non-secret config fields a token provider needs besides its sealed token,
// declared per provider (generalizes the old hardcoded Home Assistant baseUrl).
interface ExtraField { key: string; label: string; placeholder?: string; hint?: ComponentChildren }
const EXTRA_CONFIG: Record<string, ExtraField[]> = {
  homeassistant: [{ key: "baseUrl", label: "Home Assistant URL", placeholder: "http://homeassistant.local:8123", hint: <>Private hosts need <code>GLANCEOS_ALLOW_PRIVATE_EGRESS=1</code> on the server.</> }],
  jira: [
    { key: "baseUrl", label: "Jira site URL", placeholder: "https://yourteam.atlassian.net" },
    { key: "email", label: "Account email", placeholder: "you@example.com" },
  ],
  trello: [{ key: "key", label: "API key", placeholder: "your Trello API key" }],
  gitlab: [{ key: "baseUrl", label: "GitLab URL (self-hosted)", placeholder: "https://gitlab.com" }],
  harvest: [{ key: "accountId", label: "Harvest Account ID", placeholder: "1234567" }],
  plausible: [{ key: "baseUrl", label: "Plausible URL (self-hosted)", placeholder: "https://plausible.io" }],
  umami: [{ key: "baseUrl", label: "Umami API URL", placeholder: "https://api.umami.is" }],
  posthog: [{ key: "baseUrl", label: "PostHog host", placeholder: "https://app.posthog.com" }],
  simpleanalytics: [{ key: "userId", label: "User ID", placeholder: "sa_user_id_…" }],
  plex: [{ key: "baseUrl", label: "Plex server URL", placeholder: "http://192.168.1.10:32400", hint: <>Private hosts need <code>GLANCEOS_ALLOW_PRIVATE_EGRESS=1</code> on the server.</> }],
  tautulli: [{ key: "baseUrl", label: "Tautulli URL", placeholder: "http://192.168.1.10:8181", hint: <>Private hosts need <code>GLANCEOS_ALLOW_PRIVATE_EGRESS=1</code>.</> }],
  sonarr: [{ key: "baseUrl", label: "Sonarr URL", placeholder: "http://192.168.1.10:8989", hint: <>Private hosts need <code>GLANCEOS_ALLOW_PRIVATE_EGRESS=1</code>.</> }],
  radarr: [{ key: "baseUrl", label: "Radarr URL", placeholder: "http://192.168.1.10:7878", hint: <>Private hosts need <code>GLANCEOS_ALLOW_PRIVATE_EGRESS=1</code>.</> }],
  twitch: [{ key: "clientId", label: "Twitch app Client-ID", placeholder: "Helix API calls need this header" }],
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

  // Surface the OAuth redirect result (#/integrations?oauth=connected|error|denied), then clean the URL.
  useEffect(() => {
    const q = new URLSearchParams(location.hash.split("?")[1] ?? "");
    const r = q.get("oauth");
    if (!r) return;
    if (r === "connected") toast.success("Connected");
    else if (r === "denied") toast.error("Sign-in was cancelled");
    else toast.error(`Couldn't connect (${r.replace(/^error:/, "")})`);
    history.replaceState(null, "", "#/integrations");
  }, []);

  const remove = async (id: string) => {
    await api.del(`/api/connections/${id}`).catch(() => {});
    toast.success("Disconnected");
    refresh();
  };

  const cats = [...new Set((providers ?? []).map((p) => p.category))]
    .sort((a, b) => CAT_ORDER.indexOf(a) - CAT_ORDER.indexOf(b));

  return (
    <>
      <PageHeader title="Settings" />
      <div class="shell-content">
        <SettingsTabs active="connections" />
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
                <div class="cat-label">{CAT_LABEL[cat] ?? cat}</div>
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
  if (provider.oauth) return <OAuthForm provider={provider} />;

  const [label, setLabel] = useState(provider.label);
  const [secret, setSecret] = useState("");
  const extra = EXTRA_CONFIG[provider.id] ?? [];
  const [config, setConfig] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const needsSecret = provider.authKind === "token" || provider.authKind === "url";
  const missingExtra = extra.some((f) => !(config[f.key] || "").trim());

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/api/connections", {
        provider: provider.id,
        label,
        secret: secret || undefined,
        config: extra.length ? config : undefined,
      });
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
      <label class="field grow">
        <span>Label</span>
        <input value={label} maxLength={60} onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)} />
      </label>
      {extra.map((f) => (
        <label class="field grow" key={f.key}>
          <span>{f.label}</span>
          <input type="text" value={config[f.key] || ""} placeholder={f.placeholder} onInput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; setConfig((c) => ({ ...c, [f.key]: v })); }} />
          {f.hint && <span class="field-hint muted">{f.hint}</span>}
        </label>
      ))}
      {needsSecret && (
        <label class="field grow">
          <span>{provider.authKind === "url" ? "URL" : "Token"}</span>
          <input type={provider.authKind === "url" ? "text" : "password"} value={secret} placeholder={SECRET_HINT[provider.authKind]} onInput={(e) => setSecret((e.currentTarget as HTMLInputElement).value)} />
        </label>
      )}
      <div class="row spread" style={{ marginTop: "4px" }}>
        <span />
        <button class="primary" disabled={busy || (needsSecret && !secret) || missingExtra} onClick={save}>{busy ? "Connecting…" : "Connect"}</button>
      </div>
    </>
  );
}

// OAuth providers: the self-hoster registers their own app (client id/secret),
// then signs in via the provider redirect. The secret is sealed server-side.
function OAuthForm({ provider }: { provider: ProviderInfo }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [hasApp, setHasApp] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const redirectUri = `${location.origin}/api/oauth/${provider.id}/callback`;

  useEffect(() => {
    api.get<{ hasApp: boolean; clientId?: string }>(`/api/oauth-apps/${provider.id}`)
      .then((r) => { setHasApp(r.hasApp); if (r.clientId) setClientId(r.clientId); })
      .catch(() => setHasApp(false));
  }, [provider.id]);

  const saveApp = async () => {
    setBusy(true);
    try {
      await api.put(`/api/oauth-apps/${provider.id}`, { clientId, clientSecret });
      toast.success("App saved");
      setHasApp(true); setEditing(false); setClientSecret("");
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  };

  const connect = () => { location.href = `/api/oauth/${provider.id}/start`; };

  if (hasApp === null) return <div class="skeleton skeleton-line" />;

  const showForm = !hasApp || editing;
  return (
    <>
      {CONNECT_HELP[provider.id] && <p class="muted" style={{ marginTop: 0 }}>{CONNECT_HELP[provider.id]}</p>}
      <label class="field grow">
        <span>Authorized redirect URI <em>(add this to your OAuth app)</em></span>
        <input type="text" readOnly value={redirectUri} onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
      </label>

      {showForm ? (
        <>
          <label class="field grow">
            <span>Client ID</span>
            <input type="text" value={clientId} onInput={(e) => setClientId((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <label class="field grow">
            <span>Client secret</span>
            <input type="password" value={clientSecret} placeholder={hasApp ? "•••••• (unchanged)" : ""} onInput={(e) => setClientSecret((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <div class="row spread" style={{ marginTop: "4px" }}>
            {hasApp ? <button class="ghost" onClick={() => setEditing(false)}>Cancel</button> : <span />}
            <button class="primary" disabled={busy || !clientId || !clientSecret} onClick={saveApp}>{busy ? "Saving…" : "Save app"}</button>
          </div>
        </>
      ) : (
        <>
          <p class="muted">App registered. Sign in to connect your account.</p>
          <div class="row spread" style={{ marginTop: "4px" }}>
            <button class="ghost" onClick={() => setEditing(true)}>Edit app</button>
            <button class="primary" onClick={connect}>Connect {provider.label}</button>
          </div>
        </>
      )}
    </>
  );
}
