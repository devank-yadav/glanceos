import { useEffect, useRef, useState } from "preact/hooks";
import { api, type SetupSummary, type UserInfo } from "../api";
import { AVAILABLE, getLocale, setLocale, t } from "../i18n";
import { useConfirm } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { SettingsTabs } from "../components/SettingsTabs";
import { TimezoneSelect } from "../components/TimezoneSelect";
import { LocationPicker, type ChosenLocation } from "../components/LocationPicker";
import { useToast } from "../components/Toast";

// Account management: rename, change password, log out everywhere, export a
// backup, and delete the account (cascades all data server-side).
export function AccountPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [name, setName] = useState("");
  const [tz, setTz] = useState("");
  const [homeName, setHomeName] = useState<string | null>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [delPw, setDelPw] = useState("");
  const [boardText, setBoardText] = useState("");
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [importBusy, setImportBusy] = useState(false);
  // #167 — privacy dashboard: what's stored about you.
  const [data, setData] = useState<{ boards: number; screens: number; automations: number; customDataKeys: number; tasks: number; inlets: number; apiKeys: number; connections: { provider: string; label: string; status: string }[] } | null>(null);
  // #149 — Focus mode: a personal toggle (stored as the `focusMode` data key) that hides
  // every block marked "Hide in Focus mode" across the user's screens.
  const [focus, setFocus] = useState(false);
  // #147 — Home board: the user's boards, to pick a personal "home" shown on any of their
  // screens with no board of its own.
  const [boards, setBoards] = useState<SetupSummary[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    api.get<{ user: UserInfo | null }>("/api/auth/status")
      .then((s) => { if (s.user) { setUser(s.user); setName(s.user.name); setTz(s.user.defaultTimezone ?? ""); setHomeName(s.user.homeLocationName ?? null); } })
      .catch(() => {});
    api.get<NonNullable<typeof data>>("/api/account/data-summary").then(setData).catch(() => {});
    api.get<{ value?: unknown }>("/api/data/focusMode").then((r) => setFocus(r.value === true || r.value === "true" || r.value === "on")).catch(() => {});
    api.get<SetupSummary[]>("/api/layouts").then(setBoards).catch(() => {});
  }, []);

  const saveHomeBoard = async (id: number | null) => {
    try { const u = await api.patch<UserInfo>("/api/account", { homeLayoutId: id }); setUser(u); toast.success(id ? "Home board set" : "Home board cleared"); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  const toggleFocus = async () => {
    const nextOn = !focus;
    setFocus(nextOn);
    try { await api.post("/api/data/focusMode", { value: nextOn }); toast.success(nextOn ? "Focus mode on — noisy blocks hidden on your screens" : "Focus mode off"); }
    catch { setFocus(!nextOn); toast.error("Couldn't update Focus mode"); }
  };

  const toLogin = () => { location.hash = "#/login"; location.reload(); };

  const restore = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error("Choose a backup file first"); return; }
    let dump: unknown;
    try { dump = JSON.parse(await file.text()); } catch { toast.error("That file isn't valid JSON"); return; }
    if (importMode === "replace" && !(await confirm({ title: "Replace everything?", body: "This deletes your current boards, connections and tasks, then restores from the file. This can't be undone.", confirmLabel: "Replace all", danger: true }))) return;
    setImportBusy(true);
    try {
      const r = await api.post<{ layouts: number; connections: number; tasks: number; skipped: number }>("/api/account/import", { dump, mode: importMode });
      toast.success(`Restored ${r.layouts} board(s), ${r.connections} connection(s)${r.skipped ? `, ${r.skipped} skipped` : ""}. Reconnect any apps to re-add their tokens.`);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
    finally { setImportBusy(false); }
  };

  const importBoard = async (raw: string) => {
    try {
      const parsed = JSON.parse(raw) as { name?: string };
      await api.post("/api/layouts", { name: parsed?.name ?? "Imported board", document: parsed });
      toast.success("Board imported — find it under Boards");
      setBoardText("");
    } catch (e) {
      toast.error(e instanceof SyntaxError ? "That isn't valid JSON." : String(e instanceof Error ? e.message : e));
    }
  };
  const onBoardFile = (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (file) file.text().then(importBoard);
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
  const saveHome = async (loc: ChosenLocation | null) => {
    setHomeName(loc ? loc.name : null);
    try {
      // Picking a home (city search or "use my location") sets the account timezone
      // too when none is set yet — so a fresh account is fully located in one step.
      const body: { home: { name: string; latitude: number; longitude: number } | null; defaultTimezone?: string } = {
        home: loc ? { name: loc.name, latitude: loc.latitude, longitude: loc.longitude } : null,
      };
      if (loc?.timezone && !tz) { body.defaultTimezone = loc.timezone; setTz(loc.timezone); }
      const u = await api.patch<UserInfo>("/api/account", body);
      setUser(u);
      toast.success(loc ? "Home location saved" : "Home location cleared");
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
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
    if (!(await confirm({ title: "Delete your account?", body: "This permanently removes your boards, screens, connections and tasks. This cannot be undone.", confirmLabel: "Delete account", danger: true }))) return;
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
          <div class="field grow"><span>Home location <em>(screens &amp; weather/sun blocks with no location of their own use this)</em></span>
            <LocationPicker current={homeName} onPick={saveHome} onClear={() => saveHome(null)} />
          </div>
          <div class="row"><button class="primary" onClick={saveName}>Save</button></div>
        </section>

        <section class="card account-section">
          <h2>Password</h2>
          <label class="field grow"><span>Current password</span><input type="password" autoComplete="current-password" value={cur} onInput={(e) => setCur((e.currentTarget as HTMLInputElement).value)} /></label>
          <label class="field grow"><span>New password <em>(min 8 characters)</em></span><input type="password" autoComplete="new-password" value={next} onInput={(e) => setNext((e.currentTarget as HTMLInputElement).value)} /></label>
          <div class="row"><button class="primary" disabled={!cur || next.length < 8} onClick={savePassword}>Change password</button></div>
        </section>

        <section class="card account-section">
          <h2>Home board</h2>
          <p class="muted">Your personal "my glance". Any of your screens that has no board of its own (and isn't driven by a group) shows this one — so your board follows you to whatever screen you sit at.</p>
          <label class="field" style={{ maxWidth: "320px" }}>
            <span>Show this board on my unassigned screens</span>
            <select value={user?.homeLayoutId ?? ""} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; saveHomeBoard(v ? Number(v) : null); }}>
              <option value="">None</option>
              {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        </section>

        <section class="card account-section">
          <h2>Focus mode</h2>
          <p class="muted">Hide noisy blocks across your screens for deep work. Mark blocks <em>"Hide in Focus mode"</em> in the Studio, then flip this — your screens update instantly. An automation can also turn it on automatically (e.g. when your calendar shows you're in a meeting).</p>
          <div class="row">
            <button class={focus ? "primary" : "ghost"} onClick={toggleFocus} aria-pressed={focus}>
              {focus ? "Focus is on — turn off" : "Turn Focus on"}
            </button>
          </div>
        </section>

        {data && (
          <section class="card account-section">
            <h2>Your data</h2>
            <p class="muted">Everything GlanceOS stores for your account — nothing more. Export the full backup or delete the account below.</p>
            <div class="data-grid">
              {([["Boards", data.boards], ["Screens", data.screens], ["Automations", data.automations], ["Tasks", data.tasks], ["Data keys", data.customDataKeys], ["Webhooks", data.inlets], ["API keys", data.apiKeys]] as [string, number][]).map(([label, n]) => (
                <div class="data-stat" key={label}><b>{n}</b><span>{label}</span></div>
              ))}
            </div>
            {data.connections.length > 0 && (
              <>
                <p class="muted data-conn-head">Connected apps that can read data on your behalf:</p>
                <ul class="data-conn-list">
                  {data.connections.map((c, i) => (
                    <li key={i}>
                      <span class="data-conn-label">{c.label}</span>
                      <span class="muted">{c.provider}</span>
                      <span class={`chip conn-${c.status}`}>{c.status === "ok" ? "Connected" : c.status === "needs_auth" ? "Needs auth" : "Error"}</span>
                    </li>
                  ))}
                </ul>
                <p class="muted">Manage or disconnect any of these on the <a href="#/integrations">Connections</a> page.</p>
              </>
            )}
          </section>
        )}

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
            <p class="muted">Rebuilds your boards and connection settings from a backup file. App tokens aren't included — reconnect each app afterwards.</p>
            <div class="row wrap restore-row">
              <input ref={fileRef} type="file" accept="application/json,.json" />
              <select value={importMode} onChange={(e) => setImportMode((e.currentTarget as HTMLSelectElement).value as "append" | "replace")}>
                <option value="append">Add to my current data</option>
                <option value="replace">Replace everything</option>
              </select>
              <button class="primary" disabled={importBusy} onClick={restore}>{importBusy ? "Restoring…" : "Restore"}</button>
            </div>
          </div>
          <div class="restore-block">
            <h3>Import a board</h3>
            <p class="muted">Paste an exported board's JSON, or pick a <code>.glanceos.json</code> file. It's added to your Boards.</p>
            <textarea rows={4} placeholder='{"schemaVersion":3, …}' value={boardText} onInput={(e) => setBoardText((e.currentTarget as HTMLTextAreaElement).value)} />
            <div class="row wrap restore-row">
              <input type="file" accept=".json,application/json" onChange={onBoardFile} aria-label="Choose a board file" />
              <button class="primary" disabled={!boardText.trim()} onClick={() => importBoard(boardText)}>Import board</button>
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
