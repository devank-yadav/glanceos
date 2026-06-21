import { useEffect, useRef, useState } from "preact/hooks";
import { api, type UserInfo } from "../api";
import { AVAILABLE, getLocale, setLocale, t } from "../i18n";
import { useConfirm } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { SettingsTabs } from "../components/SettingsTabs";
import { TimezoneSelect } from "../components/TimezoneSelect";
import { useToast } from "../components/Toast";

// Account management: rename, change password, log out everywhere, export a
// backup, and delete the account (cascades all data server-side).
export function AccountPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [name, setName] = useState("");
  const [tz, setTz] = useState("");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [delPw, setDelPw] = useState("");
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [importBusy, setImportBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    api.get<{ user: UserInfo | null }>("/api/auth/status")
      .then((s) => { if (s.user) { setUser(s.user); setName(s.user.name); setTz(s.user.defaultTimezone ?? ""); } })
      .catch(() => {});
  }, []);

  const toLogin = () => { location.hash = "#/login"; location.reload(); };

  const restore = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error("Choose a backup file first"); return; }
    let dump: unknown;
    try { dump = JSON.parse(await file.text()); } catch { toast.error("That file isn't valid JSON"); return; }
    if (importMode === "replace" && !(await confirm({ title: "Replace everything?", body: "This deletes your current boards, playlists, connections and tasks, then restores from the file. This can't be undone.", confirmLabel: "Replace all", danger: true }))) return;
    setImportBusy(true);
    try {
      const r = await api.post<{ layouts: number; playlists: number; connections: number; tasks: number; skipped: number }>("/api/account/import", { dump, mode: importMode });
      toast.success(`Restored ${r.layouts} board(s), ${r.playlists} playlist(s), ${r.connections} connection(s)${r.skipped ? `, ${r.skipped} skipped` : ""}. Reconnect any apps to re-add their tokens.`);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
    finally { setImportBusy(false); }
  };

  const saveName = async () => {
    try { await api.patch("/api/account", { name }); toast.success("Name updated"); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const saveTimezone = async (next: string) => {
    setTz(next);
    try { await api.patch("/api/account", { defaultTimezone: next || null }); toast.success("Default timezone saved"); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const savePassword = async () => {
    try {
      await api.post("/api/account/password", { current: cur, next });
      setCur(""); setNext(""); toast.success("Password changed");
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const logoutEverywhere = async () => {
    if (!(await confirm({ title: "Log out everywhere?", body: "Every signed-in session (including this one) will be ended.", confirmLabel: "Log out everywhere" }))) return;
    await api.post("/api/account/logout-everywhere").catch(() => {});
    toLogin();
  };
  const deleteAccount = async () => {
    if (!delPw) { toast.error("Enter your password to delete the account"); return; }
    if (!(await confirm({ title: "Delete your account?", body: "This permanently removes your boards, screens, playlists, connections and tasks. This cannot be undone.", confirmLabel: "Delete account", danger: true }))) return;
    try {
      await api.del("/api/account", { password: delPw });
      toLogin();
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  return (
    <>
      <PageHeader title="Settings" />
      <div class="shell-content account-page">
        <SettingsTabs active="account" />
        <section class="card account-section">
          <h2>Profile</h2>
          <label class="field grow"><span>Name</span><input value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} /></label>
          <label class="field grow"><span>Email</span><input value={user?.email ?? ""} disabled /></label>
          <label class="field grow"><span>Default timezone <em>(screens with no timezone of their own use this)</em></span>
            <TimezoneSelect value={tz} onChange={saveTimezone} placeholder="Server timezone" />
          </label>
          <div class="row"><button class="primary" onClick={saveName}>Save</button></div>
        </section>

        <section class="card account-section">
          <h2>Password</h2>
          <label class="field grow"><span>Current password</span><input type="password" autoComplete="current-password" value={cur} onInput={(e) => setCur((e.currentTarget as HTMLInputElement).value)} /></label>
          <label class="field grow"><span>New password <em>(min 8 characters)</em></span><input type="password" autoComplete="new-password" value={next} onInput={(e) => setNext((e.currentTarget as HTMLInputElement).value)} /></label>
          <div class="row"><button class="primary" disabled={!cur || next.length < 8} onClick={savePassword}>Change password</button></div>
        </section>

        <section class="card account-section">
          <h2>Sessions & data</h2>
          <div class="row wrap">
            <a class="ghost" href="/api/account/export">Download backup (.json)</a>
            <button class="ghost" onClick={logoutEverywhere}>Log out everywhere</button>
          </div>
          <label class="field" style={{ maxWidth: "220px", marginTop: "12px" }}>
            <span>{t("settings.language")}</span>
            <select value={getLocale()} onChange={(e) => { setLocale((e.currentTarget as HTMLSelectElement).value); location.reload(); }}>
              {AVAILABLE.map((l) => <option key={l} value={l}>{t(`lang.${l}`)}</option>)}
            </select>
          </label>
          <div class="restore-block">
            <h3>Restore from a backup</h3>
            <p class="muted">Rebuilds your boards, playlists and connection settings from a backup file. App tokens aren't included — reconnect each app afterwards.</p>
            <div class="row wrap restore-row">
              <input ref={fileRef} type="file" accept="application/json,.json" />
              <select value={importMode} onChange={(e) => setImportMode((e.currentTarget as HTMLSelectElement).value as "append" | "replace")}>
                <option value="append">Add to my current data</option>
                <option value="replace">Replace everything</option>
              </select>
              <button class="primary" disabled={importBusy} onClick={restore}>{importBusy ? "Restoring…" : "Restore"}</button>
            </div>
          </div>
        </section>

        <ApiKeysSection />

        <section class="card account-section danger-zone">
          <h2>Danger zone</h2>
          <p class="muted">Deleting your account removes all of your data and cannot be undone.</p>
          <label class="field grow"><span>Confirm with your password</span><input type="password" value={delPw} onInput={(e) => setDelPw((e.currentTarget as HTMLInputElement).value)} /></label>
          <div class="row"><button class="ghost danger" onClick={deleteAccount}>Delete account</button></div>
        </section>
      </div>
    </>
  );
}

interface ApiKey { id: string; name: string; prefix: string; scopes: string[]; createdAt: number; lastUsed: number | null }

const SCOPE_OPTS: { id: string; label: string }[] = [
  { id: "tasks:read", label: "Read tasks" },
  { id: "tasks:write", label: "Create & update tasks" },
  { id: "queues:write", label: "Advance queues" },
  { id: "devices:read", label: "List screens" },
  { id: "layouts:read", label: "Read boards" },
  { id: "data:write", label: "Write custom data" },
];

// Scoped API keys for programmatic access (see docs/api.md). The plaintext token
// is shown exactly once, right after minting — we only ever store its hash.
function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null); // the just-minted token
  const toast = useToast();
  const confirm = useConfirm();

  const load = () => api.get<ApiKey[]>("/api/account/api-keys").then(setKeys).catch(() => setKeys([]));
  useEffect(() => { load(); }, []);

  const toggle = (id: string) => setScopes((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const mint = async () => {
    if (!name.trim() || scopes.size === 0) return;
    setBusy(true);
    try {
      const res = await api.post<{ token: string; key: ApiKey }>("/api/account/api-keys", { name: name.trim(), scopes: [...scopes] });
      setFresh(res.token);
      setName(""); setScopes(new Set());
      await load();
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  };
  const revoke = async (k: ApiKey) => {
    if (!(await confirm({ title: `Revoke "${k.name}"?`, body: "Any integration using this key stops working immediately.", confirmLabel: "Revoke", danger: true }))) return;
    await api.del(`/api/account/api-keys/${k.id}`).catch(() => {});
    await load();
  };
  const copy = (s: string) => navigator.clipboard?.writeText(s).then(() => toast.success("Copied"), () => {});

  return (
    <section class="card account-section">
      <h2>API keys</h2>
      <p class="muted">Grant programmatic access with a scoped <code>Bearer</code> token. See <a href="https://github.com/devank-yadav/glanceos/blob/main/docs/api.md" target="_blank" rel="noreferrer">the API docs</a>.</p>

      {fresh && (
        <div class="callout token-reveal">
          <strong>Copy your new key now — it won't be shown again.</strong>
          <div class="row token-row">
            <code class="token-value">{fresh}</code>
            <button class="ghost" onClick={() => copy(fresh)}>Copy</button>
            <button class="ghost" onClick={() => setFresh(null)}>Done</button>
          </div>
        </div>
      )}

      <div class="key-mint">
        <label class="field grow"><span>Key name</span>
          <input value={name} placeholder="e.g. Home Assistant" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <fieldset class="scope-grid">
          <legend>Scopes</legend>
          {SCOPE_OPTS.map((s) => (
            <label key={s.id} class="scope-opt">
              <input type="checkbox" checked={scopes.has(s.id)} onChange={() => toggle(s.id)} />
              <span>{s.label} <code>{s.id}</code></span>
            </label>
          ))}
        </fieldset>
        <button class="primary" disabled={busy || !name.trim() || scopes.size === 0} onClick={mint}>Create key</button>
      </div>

      {keys && keys.length > 0 && (
        <ul class="picker-list key-list">
          {keys.map((k) => (
            <li key={k.id} class="row spread">
              <span class="key-meta">
                <strong>{k.name}</strong> <code>{k.prefix}…</code>
                <span class="muted key-scopes">{k.scopes.join(", ")}</span>
                <span class="muted">{k.lastUsed ? `last used ${new Date(k.lastUsed).toLocaleDateString()}` : "never used"}</span>
              </span>
              <button class="ghost danger" onClick={() => revoke(k)}>Revoke</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
