import { useEffect, useRef, useState } from "preact/hooks";
import { api, type SceneSummary, type SetupSummary, type UserInfo } from "../api";
import { AVAILABLE, getLocale, setLocale, t } from "../i18n";
import { useConfirm } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { SettingsTabs } from "../components/SettingsTabs";
import { TimezoneSelect } from "../components/TimezoneSelect";
import { LocationPicker, type ChosenLocation } from "../components/LocationPicker";
import { useToast } from "../components/Toast";

// #152 — coerce a stored data value to a chartable number (number or numeric string), else null.
const toNum = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
};
// #152 — a tiny inline trend line for a metric's recent history (currentColor, e-ink-safe).
function miniSpark(values: number[]): string {
  if (values.length < 2) return "";
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1, w = 90, h = 22;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${pts}"/></svg>`;
}

const dayStr = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// #42 — minute-of-day ↔ the <input type="time"> value, for the daily-brief send time.
const minToTime = (m: number): string => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const timeToMin = (t: string): number => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
// #151 — a habit's streak = consecutive days done, ending today (or yesterday if today isn't done
// yet, so the streak stays alive until midnight). Points come from the #27 metric history.
function habitStreak(points: { at: number }[]): { doneToday: boolean; streak: number } {
  const days = new Set(points.map((p) => dayStr(p.at)));
  const doneToday = days.has(dayStr(Date.now()));
  let streak = 0;
  const cur = new Date();
  if (!doneToday) cur.setDate(cur.getDate() - 1);
  while (days.has(dayStr(cur.getTime()))) { streak++; cur.setDate(cur.getDate() - 1); }
  return { doneToday, streak };
}

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
  // #42 — whether the server can send mail at all (true until told otherwise, so the
  // warning never flashes during load).
  const [emailReady, setEmailReady] = useState(true);
  // #147 — Home board: the user's boards, to pick a personal "home" shown on any of their
  // screens with no board of its own.
  const [boards, setBoards] = useState<SetupSummary[]>([]);
  // #3 — Scenes: named snapshots of your data values, applied in one tap.
  const [scenes, setScenes] = useState<SceneSummary[]>([]);
  const [sceneName, setSceneName] = useState("");
  // #152 — personal metrics journal: numeric data keys you log over time (auto-tracked by #27).
  const [metrics, setMetrics] = useState<{ key: string; value: number; points: number[]; target?: number; priv: boolean }[]>([]);
  const [newMetric, setNewMetric] = useState("");
  const [newValue, setNewValue] = useState("");
  // #153 — reflection journal: today's prompt + entry, and recent entries.
  const [journal, setJournal] = useState<{ day: string; prompt: string; entry: { text: string } | null; recent: { day: string; text: string }[] } | null>(null);
  const [journalText, setJournalText] = useState("");
  // #151 — habits: a `habit.<name>` numeric key logged (=1) each day you do it; streaks from #27.
  const [habits, setHabits] = useState<{ key: string; name: string; doneToday: boolean; streak: number }[]>([]);
  const [newHabit, setNewHabit] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    api.get<{ user: UserInfo | null; emailReady?: boolean }>("/api/auth/status")
      .then((s) => { setEmailReady(s.emailReady !== false); if (s.user) { setUser(s.user); setName(s.user.name); setTz(s.user.defaultTimezone ?? ""); setHomeName(s.user.homeLocationName ?? null); } })
      .catch(() => {});
    api.get<NonNullable<typeof data>>("/api/account/data-summary").then(setData).catch(() => {});
    api.get<{ value?: unknown }>("/api/data/focusMode").then((r) => setFocus(r.value === true || r.value === "true" || r.value === "on")).catch(() => {});
    api.get<SetupSummary[]>("/api/layouts").then(setBoards).catch(() => {});
    api.get<SceneSummary[]>("/api/scenes").then(setScenes).catch(() => {});
    loadMetrics();
    loadJournal();
    loadHabits();
  }, []);

  // #151 — load `habit.<name>` keys, each with today-done + streak from its recorded history.
  const loadHabits = async () => {
    try {
      const all = await api.get<{ key: string }[]>("/api/data");
      const keys = all.filter((d) => d.key.startsWith("habit.")).map((d) => d.key);
      const rows = await Promise.all(keys.map(async (key) => {
        const h = await api.get<{ points: { at: number }[] }>(`/api/data/${encodeURIComponent(key)}/history?days=365`).catch(() => ({ points: [] as { at: number }[] }));
        return { key, name: key.slice("habit.".length), ...habitStreak(h.points) };
      }));
      setHabits(rows.sort((a, b) => a.name.localeCompare(b.name)));
    } catch { /* card stays empty */ }
  };
  const markHabit = async (key: string) => {
    try { await api.post(`/api/data/${encodeURIComponent(key)}`, { value: 1 }); await loadHabits(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const addHabit = async () => {
    const name = newHabit.trim().replace(/[^\w -]/g, "");
    if (!name) return;
    await markHabit(`habit.${name}`); setNewHabit(""); // adding = you did it today
    toast.success(`Tracking "${name}"`);
  };
  const removeHabit = async (key: string) => {
    try { await api.del(`/api/data/${encodeURIComponent(key)}`); await loadHabits(); } // #27 clears its history too
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  // #153 — the journal for the user's LOCAL today (the server computes the prompt for that date).
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const loadJournal = async () => {
    try { const j = await api.get<NonNullable<typeof journal>>(`/api/journal?day=${localToday()}`); setJournal(j); setJournalText(j.entry?.text ?? ""); }
    catch { /* card stays empty */ }
  };
  const saveJournal = async () => {
    try { await api.put("/api/journal", { day: localToday(), text: journalText }); toast.success(journalText.trim() ? "Saved today's reflection" : "Cleared today's entry"); await loadJournal(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  // #152 — the numeric data keys the user tracks, each with its recent history for a mini trend.
  const loadMetrics = async () => {
    try {
      const all = await api.get<{ key: string; value: unknown; private?: boolean }[]>("/api/data");
      // #151 goals — a `target.<key>` value is the goal for that metric (shown as % progress).
      const targets: Record<string, number> = {};
      for (const d of all) { if (d.key.startsWith("target.")) { const n = toNum(d.value); if (n != null) targets[d.key.slice(7)] = n; } }
      const numeric = all.filter((d) => toNum(d.value) != null && !d.key.startsWith("habit.") && !d.key.startsWith("target.")); // habits + goals live elsewhere
      const withHist = await Promise.all(numeric.map(async (d) => {
        const h = await api.get<{ points: { value: number }[] }>(`/api/data/${encodeURIComponent(d.key)}/history?days=90`).catch(() => ({ points: [] as { value: number }[] }));
        return { key: d.key, value: toNum(d.value)!, points: h.points.map((p) => p.value), target: targets[d.key], priv: d.private === true };
      }));
      setMetrics(withHist);
    } catch { /* the card just stays empty */ }
  };
  const logValue = async (key: string, value: number) => {
    if (!Number.isFinite(value)) return;
    try { await api.post(`/api/data/${encodeURIComponent(key)}`, { value }); toast.success(`Logged ${key}: ${value}`); await loadMetrics(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const trackNew = async () => {
    const name = newMetric.trim(); const value = Number(newValue);
    if (!name || !Number.isFinite(value)) { toast.error("Enter a name and a number"); return; }
    await logValue(name, value); setNewMetric(""); setNewValue("");
  };
  // #156 — flip a key's privacy: private keys render only on your own screens, never on shares.
  const togglePrivacy = async (key: string, next: boolean) => {
    try { await api.post(`/api/data/${encodeURIComponent(key)}/privacy`, { private: next }); toast.success(next ? `${key} is now private` : `${key} can show on shared boards`); await loadMetrics(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  // #151 goals — set (or clear, with null) a metric's target, stored as `target.<key>`.
  const setTarget = async (key: string, target: number | null) => {
    try {
      if (target == null || !Number.isFinite(target)) await api.del(`/api/data/${encodeURIComponent(`target.${key}`)}`).catch(() => {});
      else await api.post(`/api/data/${encodeURIComponent(`target.${key}`)}`, { value: target });
      await loadMetrics();
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  const captureScene = async () => {
    const name = sceneName.trim();
    if (!name) return;
    try { const s = await api.post<SceneSummary>("/api/scenes", { name }); setScenes([s, ...scenes]); setSceneName(""); toast.success(`Saved "${s.name}" (${s.keyCount} value${s.keyCount === 1 ? "" : "s"})`); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const applyScene = async (id: number, name: string) => {
    try { const r = await api.post<{ applied: number }>(`/api/scenes/${id}/apply`); toast.success(`Applied "${name}" — ${r.applied} value${r.applied === 1 ? "" : "s"} set`); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const deleteScene = async (id: number) => {
    try { await api.del(`/api/scenes/${id}`); setScenes(scenes.filter((s) => s.id !== id)); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  const saveHomeBoard = async (id: number | null) => {
    try { const u = await api.patch<UserInfo>("/api/account", { homeLayoutId: id }); setUser(u); toast.success(id ? "Home board set" : "Home board cleared"); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  // #42 — schedule (or switch off with null) the emailed daily brief.
  const saveBrief = async (at: number | null) => {
    try { const u = await api.patch<UserInfo>("/api/account", { dailyBriefAt: at }); setUser(u); toast.success(at != null ? `Daily brief at ${minToTime(at)}` : "Daily brief off"); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  // #155 — merge one field into the new-board defaults (stock values fall out server-side).
  const saveBoardDefaults = async (patch: Record<string, unknown>) => {
    try { const u = await api.patch<UserInfo>("/api/account", { boardDefaults: { ...(user?.boardDefaults ?? {}), ...patch } }); setUser(u); toast.success("New-board defaults saved"); }
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
          <h2>New-board defaults</h2>
          <p class="muted">Your taste, applied to every board you create from now on — theme, type size, and look. Existing boards are untouched.</p>
          <div class="row wrap" style={{ gap: "10px" }}>
            <label class="field"><span>Theme</span>
              <select value={user?.boardDefaults?.mode ?? "light"} onChange={(e) => saveBoardDefaults({ mode: (e.currentTarget as HTMLSelectElement).value })}>
                <option value="light">Light</option><option value="dark">Dark</option><option value="auto">Auto (day / night)</option>
              </select>
            </label>
            <label class="field"><span>Type size</span>
              <select value={user?.boardDefaults?.fontScale ?? "m"} onChange={(e) => saveBoardDefaults({ fontScale: (e.currentTarget as HTMLSelectElement).value })}>
                <option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option>
              </select>
            </label>
            <label class="field"><span>Look</span>
              <select value={user?.boardDefaults?.look ?? ""} onChange={(e) => saveBoardDefaults({ look: (e.currentTarget as HTMLSelectElement).value || undefined })}>
                <option value="">Default (calm sans)</option>
                <option value="editorial">Editorial</option><option value="terminal">Terminal</option>
                <option value="grotesk">Grotesk</option><option value="stencil">Stencil</option>
              </select>
            </label>
          </div>
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

        <section class="card account-section">
          <h2>Daily brief by email</h2>
          <p class="muted">The wall's calm morning brief — today's meetings, tasks and weather — in your inbox. Sent once a day at your chosen time, in your timezone.</p>
          <div class="row">
            <button class={user?.dailyBriefAt != null ? "primary" : "ghost"} aria-pressed={user?.dailyBriefAt != null} onClick={() => saveBrief(user?.dailyBriefAt != null ? null : 420)}>
              {user?.dailyBriefAt != null ? "On — turn off" : "Turn on"}
            </button>
            {user?.dailyBriefAt != null && (
              <label class="field"><span>Send at</span>
                <input type="time" value={minToTime(user.dailyBriefAt)} onChange={(e) => saveBrief(timeToMin((e.currentTarget as HTMLInputElement).value))} />
              </label>
            )}
          </div>
          {!emailReady && <p class="muted">This server has no mail backend (RESEND_API_KEY or SMTP) — briefs are skipped until one is configured.</p>}
        </section>

        <section class="card account-section">
          <h2>Scenes</h2>
          <p class="muted">Save your wall's current data values as a named scene ("Focus", "Meeting", "Away"), then re-apply it in one tap — every screen of yours updates at once.</p>
          <div class="row wrap" style={{ gap: "8px" }}>
            <input placeholder="Scene name" value={sceneName} onInput={(e) => setSceneName((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === "Enter") captureScene(); }} />
            <button class="ghost" disabled={!sceneName.trim()} onClick={captureScene}>Save current as scene</button>
          </div>
          {scenes.length > 0 && (
            <ul class="scene-list">
              {scenes.map((s) => (
                <li key={s.id} class="row spread scene-row">
                  <span><b>{s.name}</b> <span class="muted">· {s.keyCount} value{s.keyCount === 1 ? "" : "s"}</span></span>
                  <span class="row" style={{ gap: "4px" }}>
                    <button class="ghost" onClick={() => applyScene(s.id, s.name)}>Apply</button>
                    <button class="ghost danger" onClick={() => deleteScene(s.id)}>Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section class="card account-section">
          <h2>Personal metrics</h2>
          <p class="muted">Log a number over time — weight, mood, focus hours — and it trends itself. Set a goal to track progress toward it. Add a “Metric trend” block to a board to show any of these on a screen.</p>
          {metrics.length > 0 && (
            <ul class="metric-journal">
              {metrics.map((m) => (
                <li key={m.key} class="row spread metric-row">
                  <span class="metric-name">{m.key}</span>
                  <span class="metric-spark" dangerouslySetInnerHTML={{ __html: miniSpark(m.points) }} />
                  <strong class="metric-cur">{m.value}{m.target != null ? <span class="muted"> / {m.target}</span> : null}</strong>
                  {m.target != null && m.target !== 0 && <span class="metric-pct muted" title="Progress to goal">{Math.round((m.value / m.target) * 100)}%</span>}
                  <input class="metric-input" type="number" step="any" placeholder="log…" title={`Log a new ${m.key}`}
                    onKeyDown={(e) => { if (e.key === "Enter") { const el = e.currentTarget as HTMLInputElement; const v = Number(el.value); if (el.value.trim() && Number.isFinite(v)) { logValue(m.key, v); el.value = ""; } } }} />
                  <input class="metric-goal" type="number" step="any" placeholder="goal" title={`Goal for ${m.key}`} value={m.target ?? ""}
                    onChange={(e) => { const v = (e.currentTarget as HTMLInputElement).value.trim(); setTarget(m.key, v ? Number(v) : null); }} />
                  <button class="ghost icon-btn" aria-label={m.priv ? `${m.key} is private` : `Make ${m.key} private`}
                    title={m.priv ? "Private — never shown on a public share. Click to allow." : "Shown on shared boards. Click to keep it private."}
                    onClick={() => togglePrivacy(m.key, !m.priv)}>{m.priv ? "🔒" : "🔓"}</button>
                </li>
              ))}
            </ul>
          )}
          <div class="row wrap" style={{ gap: "8px" }}>
            <input placeholder="metric name (e.g. weight)" value={newMetric} onInput={(e) => setNewMetric((e.currentTarget as HTMLInputElement).value)} />
            <input type="number" step="any" placeholder="value" value={newValue} onInput={(e) => setNewValue((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === "Enter") trackNew(); }} />
            <button class="ghost" disabled={!newMetric.trim() || newValue.trim() === ""} onClick={trackNew}>Track a number</button>
          </div>
        </section>

        <section class="card account-section">
          <h2>Habits</h2>
          <p class="muted">A daily “yes” — meditate, walk, read — with a streak. Tap Done each day you do it; miss a day and the streak resets.</p>
          {habits.length > 0 && (
            <ul class="habit-list">
              {habits.map((h) => (
                <li key={h.key} class="row spread habit-row">
                  <span class="habit-name">{h.name}</span>
                  <span class="habit-streak" title="Current streak">{h.streak > 0 ? `🔥 ${h.streak}` : "—"}</span>
                  <button class={`ghost${h.doneToday ? " on" : ""}`} disabled={h.doneToday} onClick={() => markHabit(h.key)}>{h.doneToday ? "✓ Done today" : "Mark done"}</button>
                  <button class="ghost danger icon-btn" aria-label={`Stop tracking ${h.name}`} title="Stop tracking" onClick={() => removeHabit(h.key)}>×</button>
                </li>
              ))}
            </ul>
          )}
          <div class="row" style={{ gap: "6px" }}>
            <input placeholder="new habit (e.g. meditate)" value={newHabit} onInput={(e) => setNewHabit((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === "Enter") addHabit(); }} />
            <button class="ghost" disabled={!newHabit.trim()} onClick={addHabit}>Add habit</button>
          </div>
        </section>

        <section class="card account-section">
          <h2>Journal</h2>
          <p class="muted">A calm end-of-day note — private by design, never shown on a shared or public board.{journal?.prompt ? <> Today's prompt: <em>{journal.prompt}</em></> : ""}. Add a “Reflection” block to a board to show it on a screen.</p>
          <textarea class="journal-write" rows={3} placeholder="Write today's reflection…" value={journalText} onInput={(e) => setJournalText((e.currentTarget as HTMLTextAreaElement).value)} />
          <div class="row"><button class="ghost" onClick={saveJournal}>Save today's entry</button></div>
          {journal && journal.recent.length > 0 && (
            <ul class="journal-list">
              {journal.recent.filter((r) => r.day !== journal.day).slice(0, 7).map((r) => (
                <li key={r.day}><span class="muted journal-day">{r.day}</span> <span class="journal-past">{r.text}</span></li>
              ))}
            </ul>
          )}
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
