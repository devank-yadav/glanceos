import type { LayoutT } from "@glanceos/schema";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { api, type DeviceSummary, type DisplayGroup, type LayoutRecord, type SetupSummary } from "../api";
import { PENDING_CLAIM_KEY } from "../claim";
import { BoardPreview, BoardPreviewById } from "../components/BoardPreview";
import { ClaimForm } from "../components/ClaimForm";
import { useConfirm } from "../components/ConfirmDialog";
import { IconButton } from "../components/IconButton";
import { LocationPicker, type ChosenLocation } from "../components/LocationPicker";
import { TimezoneSelect } from "../components/TimezoneSelect";
import { Menu } from "../components/Menu";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { ScreensTabs } from "../components/ScreensTabs";
import { StatChip } from "../components/StatChip";
import { useToast } from "../components/Toast";
import { Icon } from "../editor/icons";
import { navigate } from "../router";

export function ScreensPage() {
  const [devices, setDevices] = useState<DeviceSummary[] | null>(null);
  const [setups, setSetups] = useState<SetupSummary[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const toast = useToast();
  // Arrived via a scanned QR (?claim=…)? Read+consume the stashed code once, open
  // the connect modal, and let ClaimForm prefill + auto-submit it.
  const [pendingClaim] = useState(() => {
    try {
      const c = sessionStorage.getItem(PENDING_CLAIM_KEY);
      if (c) sessionStorage.removeItem(PENDING_CLAIM_KEY);
      return c ?? "";
    } catch { return ""; }
  });
  const [claiming, setClaiming] = useState(!!pendingClaim);

  const refresh = async () => {
    try {
      const [d, s] = await Promise.all([
        api.get<DeviceSummary[]>("/api/devices"),
        api.get<SetupSummary[]>("/api/layouts"),
      ]);
      setDevices(d); setSetups(s); setError(false);
    } catch {
      // First load fails → show an inline retry (below) rather than toast-spamming
      // every 5s; a background refresh that fails keeps the last-good cards quietly.
      setError(true);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const onClaimed = async (id: string) => { setClaiming(false); await refresh(); setPickerFor(id); };

  const actions = <button class="primary" onClick={() => setClaiming(true)}><Icon.plus /> Connect screen</button>;

  return (
    <>
      <PageHeader title="Screens" actions={devices && devices.length > 0 ? actions : undefined} />
      <div class="shell-content">
        <ScreensTabs active="screens" />
        {devices === null && error ? (
          <div class="empty-state">
            <span class="empty-icon"><Icon.monitor /></span>
            <h2>Couldn't load your screens</h2>
            <p class="muted">Check that the server is reachable, then try again.</p>
            <button class="primary" onClick={() => { setError(false); refresh(); }}>Try again</button>
          </div>
        ) : devices === null ? (
          <div class="cards">{[0, 1].map((i) => <div key={i} class="skeleton skeleton-card" />)}</div>
        ) : devices.length === 0 ? (
          <FirstScreen onClaim={() => setClaiming(true)} />
        ) : (
          <div class="cards">
            {devices.map((d) => (
              <DeviceCard key={d.id} device={d} setups={setups} onChanged={refresh} onPick={() => setPickerFor(d.id)} />
            ))}
          </div>
        )}

        <Modal open={claiming} onClose={() => setClaiming(false)} title="Connect a screen">
          <ClaimForm onClaimed={onClaimed} initialCode={pendingClaim} />
        </Modal>
        {pickerFor && (
          <SetupPicker deviceId={pickerFor} setups={setups} onClose={() => setPickerFor(null)} onDone={refresh} />
        )}
      </div>
    </>
  );
}

// #194 — the screen app's URL: served at /screen in production; its own Vite port in dev.
const screenAppUrl = (): string =>
  ["5174", "5175"].includes(location.port) ? `${location.protocol}//${location.hostname}:5173/` : `${location.origin}/screen/`;

function FirstScreen({ onClaim }: { onClaim: () => void }) {
  return (
    <div class="empty-state first-screen">
      <span class="empty-icon"><Icon.monitor /></span>
      <h2 class="empty-title">Connect your first screen</h2>
      <ol class="steps-list">
        <li><span class="step-n">1</span> Open <code>http://&lt;this-server&gt;/screen</code> on any display with a browser — or try a <strong>virtual screen</strong> in a new tab right now, no hardware needed.</li>
        <li><span class="step-n">2</span> It registers itself and shows a short claim code.</li>
        <li><span class="step-n">3</span> Enter the code here and the screen becomes yours.</li>
      </ol>
      <div class="row" style={{ gap: "8px", justifyContent: "center" }}>
        {/* #194 — see the whole loop with zero hardware: a browser tab IS a screen. */}
        <button class="ghost" onClick={() => window.open(screenAppUrl(), "_blank", "noopener")}><Icon.monitor /> Open a virtual screen</button>
        <button class="primary" onClick={onClaim}><Icon.plus /> Enter a claim code</button>
      </div>
    </div>
  );
}


function DeviceCard({ device, setups, onChanged, onPick }: { device: DeviceSummary; setups: SetupSummary[]; onChanged: () => Promise<void>; onPick: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device.name ?? "");
  const [previewing, setPreviewing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [tving, setTving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [batterying, setBatterying] = useState(false);
  const [groups, setGroups] = useState<DisplayGroup[]>([]);
  useEffect(() => { api.get<DisplayGroup[]>("/api/groups").then(setGroups).catch(() => {}); }, []);
  const toast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const rename = async () => {
    setEditing(false);
    if (name === (device.name ?? "")) return;
    try { await api.patch(`/api/devices/${device.id}`, { name }); toast.success("Renamed"); await onChanged(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const setRefresh = async (seconds: number) => {
    try { await api.patch(`/api/devices/${device.id}`, { refreshSeconds: seconds }); toast.success("Refresh rate updated"); await onChanged(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const setGroup = async (v: string) => {
    try { await api.patch(`/api/devices/${device.id}`, { groupId: v ? Number(v) : null }); toast.success("Group updated"); await onChanged(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const disconnect = async () => {
    if (!(await confirm({ title: `Disconnect "${device.name ?? "this screen"}"?`, body: "Its content is kept and can be reattached later.", confirmLabel: "Disconnect" }))) return;
    try { await api.del(`/api/devices/${device.id}`); toast.success("Screen disconnected"); await onChanged(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  // Live control (folded in from the old Remote page): nudge the screen now.
  const command = async (cmd: "reload" | "identify") => {
    try {
      const r = await api.post<{ delivered: number }>(`/api/devices/${device.id}/command`, { command: cmd });
      toast.success(r.delivered ? (cmd === "identify" ? "Pinged the screen" : "Reloading the screen") : "Screen is offline");
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  const ro = device.renderOpts ?? {};
  const setRenderOpt = async (patch: Record<string, unknown>) => {
    try { await api.patch(`/api/devices/${device.id}`, { renderOpts: { algo: ro.algo ?? "floyd", threshold: ro.threshold ?? 128, gamma: ro.gamma ?? 1, ...patch } }); await onChanged(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); } // no success toast — slider fires often
  };

  return (
    <div class="card device-card">
      <DevicePreview device={device} />
      <div class="device-card-body">
      <div class="row spread">
        <div class="row device-id">
          <span class={device.online ? "dot online" : "dot"} aria-label={device.online ? "Online" : "Offline"} title={device.online ? "Online" : "Offline"} />
          {editing ? (
            <input ref={inputRef} class="rename-input" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") { setName(device.name ?? ""); setEditing(false); } }} onBlur={rename} />
          ) : (
            <h3 class="card-title device-name" role="button" tabIndex={0} aria-label={`Rename ${device.name ?? "screen"}`} title="Click to rename" onClick={() => setEditing(true)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(true); } }}>{device.name ?? "Unnamed screen"}</h3>
          )}
        </div>
        <Menu
          trigger={<Icon.more />}
          items={[
            { label: "Reload now", icon: <Icon.convert />, onClick: () => command("reload") },
            { label: "Identify (flash)", icon: <Icon.target />, onClick: () => command("identify") },
            { label: "Location & time…", icon: <Icon.settings />, onClick: () => setSettingsOpen(true) },
            { label: "Customize blocks…", icon: <Icon.layers />, onClick: () => setCustomizing(true) },
            { label: "Low-battery board…", icon: <Icon.warning />, onClick: () => setBatterying(true) },
            { label: previewing ? "Hide e-ink preview" : "E-ink preview", icon: <Icon.monitor />, onClick: () => setPreviewing((v) => !v) },
            { label: "Schedule…", icon: <Icon.convert />, onClick: () => setScheduling(true) },
            { label: "TV mode…", icon: <Icon.monitor />, onClick: () => setTving(true) },
            { label: "Rename", icon: <Icon.pencil />, onClick: () => setEditing(true) },
            { label: "Disconnect", icon: <Icon.x />, danger: true, onClick: disconnect },
          ]}
        />
      </div>

      <p class={`tile-status${device.online ? " live" : " muted"}`} title={device.online ? "Online" : "Offline"}>
        {device.layoutName ? <>Showing <strong>{device.layoutName}</strong></> : <>No content yet</>}
      </p>
      <div class="device-meta row">
        <StatChip title="Resolution">{device.resolution}</StatChip>
        {device.battery !== null && <StatChip title="Battery">{device.battery}%{batteryHint(device.batteryForecast)}</StatChip>}
        {device.lastSeen && <StatChip title="Last seen">seen {fmtAgo(device.lastSeen)}</StatChip>}
      </div>

      {previewing && (
        <div class="eink-preview">
          <img src={`/api/devices/${device.id}/preview.png?t=${Date.now()}`} alt="e-ink preview" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
          <span class="muted">1-bit e-ink render</span>
          <div class="dither-controls">
            <label class="field"><span>Dither</span>
              <select value={ro.algo ?? "floyd"} onChange={(e) => setRenderOpt({ algo: (e.currentTarget as HTMLSelectElement).value })}>
                <option value="floyd">Floyd–Steinberg</option>
                <option value="ordered">Ordered</option>
                <option value="threshold">Threshold</option>
              </select>
            </label>
            <label class="field"><span>Threshold · {ro.threshold ?? 128}</span>
              <input type="range" min="1" max="254" value={ro.threshold ?? 128} onChange={(e) => setRenderOpt({ threshold: Number((e.currentTarget as HTMLInputElement).value) })} />
            </label>
            <label class="field"><span>Gamma · {(ro.gamma ?? 1).toFixed(1)}</span>
              <input type="range" min="0.3" max="3" step="0.1" value={ro.gamma ?? 1} onChange={(e) => setRenderOpt({ gamma: Number((e.currentTarget as HTMLInputElement).value) })} />
            </label>
          </div>
        </div>
      )}

      <div class="row device-actions">
        <button class="primary" onClick={onPick}><Icon.monitor /> Change content</button>
        {device.layoutId !== null && <button onClick={() => navigate(`/edit/${device.layoutId}`)}><Icon.pencil /> Edit board</button>}
      </div>
      <div class="device-controls">
        <label class="field refresh-field">
          <span>Refresh</span>
          <select value={String(device.refreshSeconds)} onChange={(e) => setRefresh(Number((e.currentTarget as HTMLSelectElement).value))}>
            {[60, 300, 900, 1800, 3600, 21600].map((s) => <option key={s} value={String(s)}>{fmtDuration(s)}</option>)}
          </select>
        </label>
        {groups.length > 0 && (
          <label class="field refresh-field">
            <span>Group</span>
            <select value={device.groupId ?? ""} onChange={(e) => setGroup((e.currentTarget as HTMLSelectElement).value)}>
              <option value="">No group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        )}
      </div>
      </div>

      <Modal open={scheduling} onClose={() => setScheduling(false)} title={`Schedule — ${device.name ?? "screen"}`}>
        {scheduling && <ScheduleEditor deviceId={device.id} setups={setups} onClose={() => setScheduling(false)} onSaved={onChanged} />}
      </Modal>

      <Modal open={tving} onClose={() => setTving(false)} title={`TV mode — ${device.name ?? "screen"}`}>
        {tving && <TvEditor device={device} onClose={() => setTving(false)} onSaved={onChanged} />}
      </Modal>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title={`Location & time — ${device.name ?? "screen"}`}>
        {settingsOpen && <ScreenSettings device={device} onSaved={onChanged} />}
      </Modal>

      <Modal open={customizing} onClose={() => setCustomizing(false)} title={`Customize blocks — ${device.name ?? "screen"}`}>
        {customizing && <OverridesEditor device={device} onSaved={onChanged} />}
      </Modal>

      <Modal open={batterying} onClose={() => setBatterying(false)} title={`Low-battery board — ${device.name ?? "screen"}`}>
        {batterying && <LowBatteryEditor device={device} setups={setups} onSaved={onChanged} onClose={() => setBatterying(false)} />}
      </Modal>
    </div>
  );
}

/** Per-screen location (city search) + timezone — drives weather/sun blocks and
 *  the screen's schedule wall-clock. */
function ScreenSettings({ device, onSaved }: { device: DeviceSummary; onSaved: () => Promise<void> }) {
  const [tz, setTz] = useState(device.timezone ?? "");
  const [locName, setLocName] = useState(device.locationName);
  const toast = useToast();

  const saveTz = async (next: string) => {
    setTz(next);
    try { await api.patch(`/api/devices/${device.id}`, { timezone: next || null }); await onSaved(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const saveLoc = async (loc: ChosenLocation | null) => {
    setLocName(loc ? loc.name : null);
    try {
      // Picking a city (or "use my location") sets the clock too — the screen's
      // timezone comes along, so you don't have to set it separately.
      const patch: { location: { name: string; latitude: number; longitude: number } | null; timezone?: string } = {
        location: loc ? { name: loc.name, latitude: loc.latitude, longitude: loc.longitude } : null,
      };
      if (loc?.timezone) { patch.timezone = loc.timezone; setTz(loc.timezone); }
      await api.patch(`/api/devices/${device.id}`, patch);
      await onSaved();
      toast.success(loc ? (loc.timezone ? "Location & timezone set" : "Location set") : "Location cleared");
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  return (
    <div class="screen-settings">
      <div class="field-group">
        <span class="field-label">Location</span>
        <p class="muted setting-help">Weather, forecast and sunrise/sunset blocks on this screen use this place (unless a block sets its own).</p>
        <LocationPicker current={locName} onPick={(l) => saveLoc(l)} onClear={() => saveLoc(null)} />
      </div>
      <div class="field-group">
        <span class="field-label">Timezone</span>
        <p class="muted setting-help">The screen's wall clock for schedules. Blank uses your account default, then the server.</p>
        <TimezoneSelect value={tz} onChange={saveTz} placeholder="Account default" />
      </div>
    </div>
  );
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]; // bit 0 = Sunday
const minToTime = (m: number): string => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const timeToMin = (t: string): number => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

interface SchedRule { layoutId: number; enabled: boolean; priority: number; daysMask: number; startMin: number; endMin: number }

function ScheduleEditor({ deviceId, setups, onClose, onSaved }: { deviceId: string; setups: SetupSummary[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [tz, setTz] = useState("");
  const [rules, setRules] = useState<SchedRule[] | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.get<{ timezone: string | null; schedules: SchedRule[] }>(`/api/devices/${deviceId}/schedules`)
      .then((r) => { setTz(r.timezone ?? ""); setRules(r.schedules.map((s) => ({ layoutId: s.layoutId, enabled: s.enabled, priority: s.priority, daysMask: s.daysMask, startMin: s.startMin, endMin: s.endMin }))); })
      .catch(() => setRules([]));
  }, [deviceId]);

  const update = (i: number, patch: Partial<SchedRule>) => setRules((rs) => rs!.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const toggleDay = (i: number, day: number) => update(i, { daysMask: rules![i]!.daysMask ^ (1 << day) });
  const addRule = () => setRules((rs) => [...(rs ?? []), { layoutId: setups[0]?.id ?? 0, enabled: true, priority: (rs?.length ?? 0) + 1, daysMask: 127, startMin: 9 * 60, endMin: 17 * 60 }]);
  const removeRule = (i: number) => setRules((rs) => rs!.filter((_, k) => k !== i));

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/api/devices/${deviceId}/schedules`, { timezone: tz.trim() || null, schedules: rules ?? [] });
      toast.success("Schedule saved");
      await onSaved();
      onClose();
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); setBusy(false); }
  };

  if (rules === null) return <div class="skeleton skeleton-line" />;
  if (setups.length === 0) return <p class="muted">Create a board first, then schedule it here.</p>;

  return (
    <div class="sched-editor">
      <p class="muted" style={{ marginTop: 0 }}>Show different boards by time of day. The highest-priority active window wins; outside every window the screen falls back to its assigned setup.</p>
      <label class="field grow">
        <span>Timezone <em>(blank = account default, then server)</em></span>
        <TimezoneSelect value={tz} onChange={setTz} placeholder="Account default" />
      </label>

      {rules.map((r, i) => (
        <div class="sched-rule card" key={i}>
          <div class="row spread">
            <select value={String(r.layoutId)} onChange={(e) => update(i, { layoutId: Number((e.currentTarget as HTMLSelectElement).value) })}>
              {setups.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
            <span class="row sched-rule-right">
              <label class="checkbox"><input type="checkbox" checked={r.enabled} onChange={(e) => update(i, { enabled: (e.currentTarget as HTMLInputElement).checked })} /> <span>On</span></label>
              <IconButton icon={<Icon.x />} label="Remove rule" onClick={() => removeRule(i)} />
            </span>
          </div>
          <div class="sched-days">
            {DAY_LABELS.map((d, day) => (
              <button key={day} type="button" class={`sched-day${r.daysMask & (1 << day) ? " on" : ""}`} aria-pressed={!!(r.daysMask & (1 << day))} onClick={() => toggleDay(i, day)}>{d}</button>
            ))}
          </div>
          <div class="row sched-times">
            <label class="field"><span>From</span><input type="time" value={minToTime(r.startMin)} onInput={(e) => update(i, { startMin: timeToMin((e.currentTarget as HTMLInputElement).value) })} /></label>
            <label class="field"><span>To</span><input type="time" value={minToTime(r.endMin >= 1440 ? 1439 : r.endMin)} onInput={(e) => update(i, { endMin: timeToMin((e.currentTarget as HTMLInputElement).value) })} /></label>
          </div>
        </div>
      ))}

      <div class="row spread" style={{ marginTop: "10px" }}>
        <button class="ghost" onClick={addRule}><Icon.plus /> Add rule</button>
        <button class="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save schedule"}</button>
      </div>
    </div>
  );
}


function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}
function fmtAgo(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h ago`;
  return `${Math.round(d / 86_400_000)}d ago`;
}

// A compact battery-life hint from the forecast (v6.1): "~12d left", "<1d left", "charging".
function batteryHint(f: DeviceSummary["batteryForecast"]): string {
  if (!f) return "";
  if (f.basis === "charging") return " · charging";
  if (f.daysRemaining == null) return "";
  return f.daysRemaining >= 1 ? ` · ~${Math.round(f.daysRemaining)}d left` : " · <1d left";
}

const minToHHMM = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hhmmToMin = (s: string): number => { const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

/** Per-device TV / large-display settings: kiosk mode, overscan, burn-in, sleep. */
function TvEditor({ device, onClose, onSaved }: { device: DeviceSummary; onClose: () => void; onSaved: () => Promise<void> }) {
  const t = device.tv;
  const [tvMode, setTvMode] = useState(t.tvMode);
  const [overscan, setOverscan] = useState(t.safeArea?.top ?? 0);
  const [pixelShift, setPixelShift] = useState(t.burnIn?.pixelShift ?? false);
  const [sleep, setSleep] = useState(!!t.wake);
  const [wakeStart, setWakeStart] = useState(minToHHMM(t.wake?.startMin ?? 420));
  const [wakeEnd, setWakeEnd] = useState(minToHHMM(t.wake?.endMin ?? 1380));
  const [quiet, setQuiet] = useState(!!t.quietHours);
  const [quietStart, setQuietStart] = useState(minToHHMM(t.quietHours?.startMin ?? 1320)); // 22:00
  const [quietEnd, setQuietEnd] = useState(minToHHMM(t.quietHours?.endMin ?? 420)); // 07:00
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const tvUrl = `${location.origin}/screen/?tv=1`;

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/api/devices/${device.id}`, {
        tv: {
          tvMode,
          safeArea: { top: overscan, right: overscan, bottom: overscan, left: overscan },
          burnIn: { pixelShift, dim: false, screensaverAfterMin: 0 },
          wake: sleep ? { startMin: hhmmToMin(wakeStart), endMin: hhmmToMin(wakeEnd), daysMask: 127 } : null,
          quietHours: quiet ? { startMin: hhmmToMin(quietStart), endMin: hhmmToMin(quietEnd), daysMask: 127 } : null,
        },
      });
      toast.success("TV settings saved");
      await onSaved();
      onClose();
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); setBusy(false); }
  };

  return (
    <div class="tv-editor">
      <label class="tv-check"><input type="checkbox" checked={tvMode} onChange={(e) => setTvMode((e.currentTarget as HTMLInputElement).checked)} /> <span>Kiosk mode — fullscreen, screen wake-lock, D-pad/remote navigation</span></label>
      <label class="field"><span>Overscan-safe margin · {overscan}%</span>
        <input type="range" min="0" max="15" value={overscan} onInput={(e) => setOverscan(Number((e.currentTarget as HTMLInputElement).value))} />
        <span class="field-hint muted">Pulls content in from the edges so a TV's bezel/overscan doesn't clip it.</span>
      </label>
      <label class="tv-check"><input type="checkbox" checked={pixelShift} onChange={(e) => setPixelShift((e.currentTarget as HTMLInputElement).checked)} /> <span>Burn-in protection (slow pixel-shift)</span></label>
      <label class="tv-check"><input type="checkbox" checked={sleep} onChange={(e) => setSleep((e.currentTarget as HTMLInputElement).checked)} /> <span>Sleep the display outside set hours</span></label>
      {sleep && (
        <div class="row tv-wake">
          <label class="field"><span>Wake</span><input type="time" value={wakeStart} onInput={(e) => setWakeStart((e.currentTarget as HTMLInputElement).value)} /></label>
          <label class="field"><span>Sleep</span><input type="time" value={wakeEnd} onInput={(e) => setWakeEnd((e.currentTarget as HTMLInputElement).value)} /></label>
        </div>
      )}
      <label class="tv-check"><input type="checkbox" checked={quiet} onChange={(e) => setQuiet((e.currentTarget as HTMLInputElement).checked)} /> <span>Quiet hours — gently dim the board (still on, just calmer at night)</span></label>
      {quiet && (
        <div class="row tv-wake">
          <label class="field"><span>Dim from</span><input type="time" value={quietStart} onInput={(e) => setQuietStart((e.currentTarget as HTMLInputElement).value)} /></label>
          <label class="field"><span>Until</span><input type="time" value={quietEnd} onInput={(e) => setQuietEnd((e.currentTarget as HTMLInputElement).value)} /></label>
        </div>
      )}
      <div class="tv-launch">
        <span class="muted">Open GlanceOS on the TV's browser:</span>
        <code>{tvUrl}</code>
        <button class="ghost" onClick={() => { navigator.clipboard?.writeText(tvUrl); setCopied(true); }}>{copied ? "Copied ✓" : "Copy"}</button>
      </div>
      <div class="row spread" style={{ marginTop: "4px" }}>
        <span />
        <button class="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save TV settings"}</button>
      </div>
    </div>
  );
}

/** Post-claim (and change-setup) picker: existing setup, new blank, or the hub. */
function SetupPicker({ deviceId, setups, onClose, onDone }: { deviceId: string; setups: SetupSummary[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const assign = async (layoutId: number, thenEdit = false) => {
    setBusy(true);
    try {
      await api.patch(`/api/devices/${deviceId}`, { layoutId });
      await onDone();
      onClose();
      if (thenEdit) navigate(`/edit/${layoutId}`);
      else toast.success("Board attached");
    } finally { setBusy(false); }
  };
  const createBlank = async () => {
    setBusy(true);
    try { const layout = await api.post<{ id: number }>("/api/layouts", { name: "New board" }); await assign(layout.id, true); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Choose a board for this screen">
      <button class="primary wide" disabled={busy} onClick={createBlank}>Start blank — open the studio</button>
      {setups.length > 0 && (
        <>
          <p class="muted">…or attach an existing board (screens can share one):</p>
          <div class="cards picker-cards">
            {setups.map((s) => (
              <button key={s.id} class="card hub-card picker-pick" disabled={busy} title={`Attach ${s.name}`} onClick={() => assign(s.id)}>
                <BoardPreviewById layoutId={s.id} name={s.name} />
                <div class="hub-card-body">
                  <h3 class="card-title" title={s.name}>{s.name}</h3>
                  <span class="muted picker-meta">{s.widgetCount} blocks{s.usedBy > 0 ? ` · live on ${s.usedBy}` : ""}</span>
                  <span class="picker-attach">Attach</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      <p class="muted">Want a starting point? <a href="#/hub" onClick={onClose}>Start from a template</a>, then attach it here.</p>
    </Modal>
  );
}

/** A live, scaled mini-render of what a screen is currently showing, with clear
 *  empty states for offline / unconfigured screens. */
function DevicePreview({ device }: { device: DeviceSummary }) {
  const [doc, setDoc] = useState<LayoutT | null>(null);
  const [failed, setFailed] = useState(false);
  const layoutId = device.layoutId ?? null;
  const [w, h] = parseResolution(device.resolution);

  useEffect(() => {
    let alive = true;
    setDoc(null);
    setFailed(false);
    if (layoutId === null) return;
    api.get<LayoutRecord>(`/api/layouts/${layoutId}`)
      .then((r) => { if (alive) setDoc(r.document); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [layoutId]);

  // Nothing assigned → empty state (worded for online vs offline). Otherwise show the
  // board it WOULD display, dimmed + grayscale with an "Offline" pill when offline —
  // far more informative than a blank "Not connected" card.
  if (layoutId === null) return <PreviewEmpty icon={<Icon.monitor />} label={device.online ? "No screen yet" : "Not connected"} />;
  if (failed) return <PreviewEmpty icon={<Icon.monitor />} label="Preview unavailable" />;
  if (!doc) return <div class="device-preview"><div class="board-preview is-loading" style={{ aspectRatio: `${w} / ${h}` }} /></div>;
  return (
    <div class={`device-preview${device.online ? "" : " is-offline"}`}>
      <BoardPreview doc={doc} w={w} h={h} deviceName={device.name ?? undefined} />
      {!device.online && <span class="offline-pill">Offline</span>}
    </div>
  );
}

function PreviewEmpty({ icon, label }: { icon: ComponentChildren; label: string }) {
  return (
    <div class="device-preview">
      <div class="board-preview is-empty">
        <span class="preview-empty-icon" aria-hidden="true">{icon}</span>
        <span class="muted">{label}</span>
      </div>
    </div>
  );
}

// ---- #58 low-battery board swap ----
// When a panel's battery drops to/below the threshold, the screen swaps to a calm minimal board
// (the user's choice) instead of dying mid-content. Server-side: the swap wins over the normal
// board in currentLayoutId; here we just pick the board + threshold (stored in the device profile).
function LowBatteryEditor({ device, setups, onSaved, onClose }: { device: DeviceSummary; setups: SetupSummary[]; onSaved: () => Promise<void>; onClose: () => void }) {
  const [layoutId, setLayoutId] = useState<number | null>(device.lowBattery?.layoutId ?? null);
  const [pct, setPct] = useState<number>(device.lowBattery?.pct ?? 15);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async (nextId: number | null, nextPct: number) => {
    setBusy(true);
    try {
      await api.patch(`/api/devices/${device.id}`, { lowBattery: { layoutId: nextId, pct: nextPct } });
      toast.success(nextId ? "Low-battery board set" : "Low-battery swap turned off");
      await onSaved();
      if (!nextId) onClose();
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  };
  return (
    <div class="low-battery-editor">
      <p class="muted" style={{ marginTop: 0 }}>
        When this screen's battery falls to the threshold, it switches to a minimal board so it never dies mid-content.
        {device.battery != null ? ` Currently ${device.battery}%.` : " This screen hasn't reported a battery level yet."}
      </p>
      <label class="field">
        <span>Switch to this board</span>
        <select value={layoutId ?? ""} disabled={busy} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; const id = v ? Number(v) : null; setLayoutId(id); save(id, pct); }}>
          <option value="">Off — keep the normal board</option>
          {setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {layoutId != null && (
        <label class="field">
          <span>At or below · {pct}%</span>
          <input type="range" min="5" max="50" step="5" value={pct} disabled={busy} onInput={(e) => setPct(Number((e.currentTarget as HTMLInputElement).value))} onChange={(e) => save(layoutId, Number((e.currentTarget as HTMLInputElement).value))} />
        </label>
      )}
    </div>
  );
}

// ---- #48 per-device block overrides ----
// From one shared board, a single screen can override specific blocks' props (e.g. its own
// location on a weather block). Saved as a sparse prop patch, merged server-side at compose time.
type FlatBlock = { id: string; type: string; label: string; props: Record<string, unknown> };

function flattenBlocks(doc: LayoutT): FlatBlock[] {
  const out: FlatBlock[] = [];
  const rows = (rs: LayoutT["rows"]) => { for (const r of rs) for (const b of r.blocks) out.push(toFlat(b)); };
  rows(doc.rows);
  if (doc.pages) for (const p of doc.pages) rows(p);
  if (doc.zones) for (const z of doc.zones) rows(z.rows);
  return out;
}
function toFlat(b: LayoutT["rows"][number]["blocks"][number]): FlatBlock {
  const props = ((b as { props?: unknown }).props ?? {}) as Record<string, unknown>;
  const text = [props.label, props.title, props.heading, props.text, props.name].find((v) => typeof v === "string" && v.trim());
  return { id: b.id, type: b.type, label: (text ? String(text).trim().slice(0, 44) : b.type), props };
}
// A value typed as text becomes a number/boolean/null/JSON when it parses, else stays a string —
// so "51.5" → 51.5, "true" → true, and "Kitchen" stays "Kitchen".
function parseVal(v: string): unknown { const t = v.trim(); if (!t) return ""; try { return JSON.parse(t); } catch { return v; } }
function patchToRows(patch: Record<string, unknown>): { k: string; v: string }[] {
  return Object.entries(patch).map(([k, v]) => ({ k, v: typeof v === "string" ? v : JSON.stringify(v) }));
}

function OverridesEditor({ device, onSaved }: { device: DeviceSummary; onSaved: () => Promise<void> }) {
  const [doc, setDoc] = useState<LayoutT | null>(null);
  const [failed, setFailed] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Record<string, unknown>>>({});
  const toast = useToast();
  const layoutId = device.layoutId ?? null;

  useEffect(() => {
    if (layoutId === null) return;
    let alive = true;
    api.get<LayoutRecord>(`/api/layouts/${layoutId}`).then((r) => { if (alive) setDoc(r.document); }).catch(() => { if (alive) setFailed(true); });
    api.get<{ blockId: string; props: Record<string, unknown> }[]>(`/api/devices/${device.id}/overrides`)
      .then((list) => { if (alive) setOverrides(Object.fromEntries(list.map((o) => [o.blockId, o.props]))); }).catch(() => {});
    return () => { alive = false; };
  }, [layoutId, device.id]);

  const save = async (blockId: string, patch: Record<string, unknown>) => {
    try {
      await api.put(`/api/devices/${device.id}/overrides/${blockId}`, { props: patch });
      setOverrides((m) => { const n = { ...m }; if (Object.keys(patch).length) n[blockId] = patch; else delete n[blockId]; return n; });
      toast.success(Object.keys(patch).length ? "Saved for this screen" : "Override cleared");
      await onSaved();
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  if (layoutId === null) return <p class="muted">Assign a board to this screen first — then you can tailor individual blocks just for it.</p>;
  if (failed) return <p class="muted">Couldn't load this screen's board.</p>;
  if (!doc) return <p class="muted">Loading the board…</p>;
  const blocks = flattenBlocks(doc);
  const customized = Object.keys(overrides).length;
  return (
    <div class="overrides-editor">
      <p class="muted" style={{ marginTop: 0 }}>
        Override specific blocks just for <strong>{device.name ?? "this screen"}</strong> — e.g. set this screen's own location on a weather block.
        Untouched blocks keep the shared board's values.{customized > 0 ? ` ${customized} block${customized > 1 ? "s" : ""} customized.` : ""}
      </p>
      <div class="overrides-list">
        {blocks.length === 0 && <p class="muted">This board has no blocks yet.</p>}
        {blocks.map((b) => <OverrideRow key={b.id} block={b} patch={overrides[b.id] ?? {}} onSave={(p) => save(b.id, p)} />)}
      </div>
    </div>
  );
}

function OverrideRow({ block, patch, onSave }: { block: FlatBlock; patch: Record<string, unknown>; onSave: (p: Record<string, unknown>) => Promise<void> }) {
  const has = Object.keys(patch).length > 0;
  const [open, setOpen] = useState(has);
  const [rows, setRows] = useState<{ k: string; v: string }[]>(() => patchToRows(patch));
  // Re-sync local rows when the saved override for THIS block changes (e.g. after a clear).
  useEffect(() => { setRows(patchToRows(patch)); }, [block.id, JSON.stringify(patch)]);
  const propKeys = Object.keys(block.props);
  const edit = (i: number, key: "k" | "v", val: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: val } : r)));
  const apply = () => {
    const next: Record<string, unknown> = {};
    for (const { k, v } of rows) { const key = k.trim(); if (key) next[key] = parseVal(v); }
    onSave(next);
  };
  return (
    <div class={`override-row${has ? " has-override" : ""}`}>
      <button type="button" class="override-head row spread" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span class="override-title"><Icon.layers /> <strong>{block.label}</strong> <span class="muted override-kind">{block.type}</span></span>
        <span class="row">{has && <span class="pill">customized</span>}<Icon.chevron /></span>
      </button>
      {open && (
        <div class="override-body">
          {rows.map((r, i) => (
            <div class="override-kv row" key={i}>
              <input class="override-key" list={`pk-${block.id}`} placeholder="property" value={r.k} onInput={(e) => edit(i, "k", (e.currentTarget as HTMLInputElement).value)} />
              <input class="override-val" placeholder={r.k && block.props[r.k] !== undefined ? `board: ${JSON.stringify(block.props[r.k])}` : "value"} value={r.v} onInput={(e) => edit(i, "v", (e.currentTarget as HTMLInputElement).value)} />
              <IconButton label="Remove field" icon={<Icon.trash />} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} />
            </div>
          ))}
          <datalist id={`pk-${block.id}`}>{propKeys.map((k) => <option key={k} value={k} />)}</datalist>
          <div class="row override-actions">
            <button type="button" onClick={() => setRows((rs) => [...rs, { k: "", v: "" }])}><Icon.plus /> Add field</button>
            <button type="button" class="primary" onClick={apply}>Save</button>
            {has && <button type="button" class="danger" onClick={() => { setRows([]); onSave({}); }}>Clear</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function parseResolution(res: string): [number, number] {
  const m = /(\d+)\D+(\d+)/.exec(res || "");
  return m ? [Number(m[1]), Number(m[2])] : [1920, 1080];
}
