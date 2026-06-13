import { useEffect, useRef, useState } from "preact/hooks";
import { api, type DeviceSummary, type Playlist, type QueueState, type SetupSummary, type TaskItem } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { Menu } from "../components/Menu";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { StatChip } from "../components/StatChip";
import { useToast } from "../components/Toast";
import { Icon } from "../editor/icons";
import { navigate } from "../router";

export function ScreensPage() {
  const [devices, setDevices] = useState<DeviceSummary[] | null>(null);
  const [setups, setSetups] = useState<SetupSummary[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const toast = useToast();

  const refresh = async () => {
    try {
      setDevices(await api.get<DeviceSummary[]>("/api/devices"));
      setSetups(await api.get<SetupSummary[]>("/api/layouts"));
      setPlaylists(await api.get<Playlist[]>("/api/playlists"));
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
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
        {devices === null ? (
          <div class="cards">{[0, 1].map((i) => <div key={i} class="skeleton skeleton-card" />)}</div>
        ) : devices.length === 0 ? (
          <FirstScreen onClaim={() => setClaiming(true)} />
        ) : (
          <div class="cards">
            {devices.map((d) => (
              <DeviceCard key={d.id} device={d} playlists={playlists} onChanged={refresh} onPick={() => setPickerFor(d.id)} />
            ))}
          </div>
        )}

        <DataPanels />

        <Modal open={claiming} onClose={() => setClaiming(false)} title="Connect a screen">
          <ClaimForm onClaimed={onClaimed} />
        </Modal>
        {pickerFor && (
          <SetupPicker deviceId={pickerFor} setups={setups} playlists={playlists} onClose={() => setPickerFor(null)} onDone={refresh} />
        )}
      </div>
    </>
  );
}

function FirstScreen({ onClaim }: { onClaim: () => void }) {
  return (
    <div class="empty-state first-screen">
      <span class="empty-icon"><Icon.monitor /></span>
      <h2 class="empty-title">Connect your first screen</h2>
      <ol class="steps-list">
        <li><span class="step-n">1</span> Open <code>http://&lt;this-server&gt;/screen</code> on any display with a browser (or <code>localhost:5173</code> in dev).</li>
        <li><span class="step-n">2</span> It registers itself and shows a short claim code.</li>
        <li><span class="step-n">3</span> Enter the code here and the screen becomes yours.</li>
      </ol>
      <button class="primary" onClick={onClaim}><Icon.plus /> Enter a claim code</button>
    </div>
  );
}

function ClaimForm({ onClaimed }: { onClaimed: (deviceId: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const toast = useToast();

  const claim = async () => {
    try {
      const device = await api.post<DeviceSummary>("/api/devices/claim", { code, name: name.trim() || undefined });
      toast.success("Screen connected");
      await onClaimed(device.id);
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  return (
    <>
      <label class="field grow">
        <span>Claim code</span>
        <input placeholder="7QK-D2F" value={code} autoFocus onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && code.trim().length >= 4 && claim()} />
      </label>
      <label class="field grow">
        <span>Screen name <span class="muted">(optional)</span></span>
        <input placeholder="Desk monitor" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <div class="row spread" style={{ marginTop: "4px" }}>
        <span />
        <button class="primary" disabled={code.trim().length < 4} onClick={claim}>Claim screen</button>
      </div>
    </>
  );
}

function DeviceCard({ device, playlists, onChanged, onPick }: { device: DeviceSummary; playlists: Playlist[]; onChanged: () => Promise<void>; onPick: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device.name ?? "");
  const [previewing, setPreviewing] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const rename = async () => {
    setEditing(false);
    if (name === (device.name ?? "")) return;
    await api.patch(`/api/devices/${device.id}`, { name });
    toast.success("Renamed");
    await onChanged();
  };
  const setRefresh = async (seconds: number) => {
    await api.patch(`/api/devices/${device.id}`, { refreshSeconds: seconds });
    await onChanged();
  };
  const disconnect = async () => {
    if (!(await confirm({ title: `Disconnect "${device.name ?? "this screen"}"?`, body: "Its content is kept and can be reattached later.", confirmLabel: "Disconnect" }))) return;
    await api.del(`/api/devices/${device.id}`);
    toast.success("Screen disconnected");
    await onChanged();
  };

  const playlist = device.playlistId ? playlists.find((p) => p.id === device.playlistId) : undefined;

  return (
    <div class="card device-card">
      <div class="row spread">
        <div class="row device-id">
          <span class={device.online ? "dot online" : "dot"} aria-label={device.online ? "Online" : "Offline"} title={device.online ? "Online" : "Offline"} />
          {editing ? (
            <input ref={inputRef} class="rename-input" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") { setName(device.name ?? ""); setEditing(false); } }} onBlur={rename} />
          ) : (
            <h3 class="card-title device-name" tabIndex={0} title="Click to rename" onClick={() => setEditing(true)} onKeyDown={(e) => e.key === "Enter" && setEditing(true)}>{device.name ?? "Unnamed screen"}</h3>
          )}
        </div>
        <Menu
          trigger={<Icon.list />}
          items={[
            { label: previewing ? "Hide e-ink preview" : "E-ink preview", icon: <Icon.monitor />, onClick: () => setPreviewing((v) => !v) },
            { label: "Rename", icon: <Icon.pencil />, onClick: () => setEditing(true) },
            { label: "Disconnect", icon: <Icon.x />, danger: true, onClick: disconnect },
          ]}
        />
      </div>

      <p class="muted setup-line">
        {playlist ? <>Playing <strong>{playlist.name}</strong> · {playlist.items.length} setups</>
          : device.layoutName ? <>Showing <strong>{device.layoutName}</strong></>
            : <>No setup yet — choose one</>}
      </p>

      <div class="chip-row">
        <StatChip icon={<Icon.monitor />} title="Resolution">{device.resolution}</StatChip>
        <StatChip icon={<Icon.convert />} title="Refresh interval">{fmtDuration(device.refreshSeconds)}</StatChip>
        {device.battery !== null && <StatChip title="Battery">{device.battery}%</StatChip>}
        {device.rssi !== null && <StatChip title="Wi-Fi signal">{device.rssi} dBm</StatChip>}
        {device.lastSeen && <StatChip title="Last contact">{fmtAgo(device.lastSeen)}</StatChip>}
      </div>

      {previewing && (
        <div class="eink-preview">
          <img src={`/api/devices/${device.id}/preview.png?t=${Date.now()}`} alt="e-ink preview" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
          <span class="muted">1-bit e-ink render</span>
        </div>
      )}

      <div class="row wrap device-actions">
        {device.layoutId !== null && <button class="primary" onClick={() => navigate(`/edit/${device.layoutId}`)}><Icon.pencil /> Open studio</button>}
        <button onClick={onPick}>Change content</button>
        <label class="field refresh-field">
          <span>Refresh</span>
          <select value={String(device.refreshSeconds)} onChange={(e) => setRefresh(Number((e.currentTarget as HTMLSelectElement).value))}>
            {[60, 300, 900, 1800, 3600, 21600].map((s) => <option key={s} value={String(s)}>{fmtDuration(s)}</option>)}
          </select>
        </label>
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

/** Post-claim (and change-setup) picker: existing setup, new blank, or the hub. */
function SetupPicker({ deviceId, setups, playlists, onClose, onDone }: { deviceId: string; setups: SetupSummary[]; playlists: Playlist[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const assign = async (layoutId: number, thenEdit = false) => {
    setBusy(true);
    try {
      await api.patch(`/api/devices/${deviceId}`, { layoutId });
      await onDone();
      onClose();
      if (thenEdit) navigate(`/edit/${layoutId}`);
      else toast.success("Setup attached");
    } finally { setBusy(false); }
  };
  const assignPlaylist = async (playlistId: number) => {
    setBusy(true);
    try { await api.patch(`/api/devices/${deviceId}`, { playlistId }); await onDone(); onClose(); toast.success("Playlist attached"); }
    finally { setBusy(false); }
  };
  const createBlank = async () => {
    setBusy(true);
    try { const layout = await api.post<{ id: number }>("/api/layouts", { name: "New setup" }); await assign(layout.id, true); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Choose a setup for this screen">
      <button class="primary wide" disabled={busy} onClick={createBlank}>Start blank — open the studio</button>
      {setups.length > 0 && (
        <>
          <p class="muted">…or attach an existing setup (screens can share one):</p>
          <ul class="picker-list">
            {setups.map((s) => (
              <li key={s.id} class="row spread">
                <span><strong>{s.name}</strong> <span class="muted">{s.widgetCount} blocks{s.usedBy > 0 ? ` · live on ${s.usedBy}` : ""}</span></span>
                <button disabled={busy} onClick={() => assign(s.id)}>Attach</button>
              </li>
            ))}
          </ul>
        </>
      )}
      {playlists.length > 0 && (
        <>
          <p class="muted">…or play a rotating <a href="#/playlists" onClick={onClose}>playlist</a>:</p>
          <ul class="picker-list">
            {playlists.map((p) => (
              <li key={p.id} class="row spread">
                <span><strong>{p.name}</strong> <span class="muted">{p.items.length} setups · every {fmtDuration(p.intervalSeconds)}</span></span>
                <button disabled={busy || p.items.length === 0} onClick={() => assignPlaylist(p.id)}>Play</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p class="muted">Want a starting point? <a href="#/hub" onClick={onClose}>Import from the hub</a>, then attach it here.</p>
    </Modal>
  );
}

/** The data behind tasks/queue widgets. */
function DataPanels() {
  return (
    <details class="data-panels">
      <summary><Icon.chevron class="data-chevron" /> Widget data · tasks &amp; queue</summary>
      <div class="cards">
        <TasksPanel />
        <QueuePanel />
      </div>
    </details>
  );
}

function TasksPanel() {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [text, setText] = useState("");

  const refresh = async () => setItems(await api.get<TaskItem[]>("/api/tasks?listId=default"));
  useEffect(() => { refresh().catch(() => {}); }, []);

  const add = async () => {
    if (!text.trim()) return;
    await api.post("/api/tasks", { listId: "default", text });
    setText("");
    await refresh();
  };

  return (
    <div class="card">
      <h3>Tasks</h3>
      <div class="row">
        <label class="field grow">
          <span>New task</span>
          <input value={text} onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        </label>
        <button onClick={add}>Add</button>
      </div>
      <ul class="tasks">
        {items.map((item) => (
          <li key={item.id} class="row spread">
            <label class="field checkbox">
              <input type="checkbox" checked={item.done} onChange={() => api.patch(`/api/tasks/${item.id}`, { done: !item.done }).then(refresh)} />
              <span class={item.done ? "done" : ""}>{item.text}</span>
            </label>
            <button class="ghost" onClick={() => api.del(`/api/tasks/${item.id}`).then(refresh)} aria-label="Delete task"><Icon.x /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QueuePanel() {
  const [queue, setQueue] = useState<QueueState | null>(null);

  const refresh = async () => setQueue(await api.get<QueueState>("/api/queues/default"));
  useEffect(() => {
    refresh().catch(() => {});
    const t = setInterval(() => refresh().catch(() => {}), 5000);
    return () => clearInterval(t);
  }, []);

  const act = async (path: string, body?: unknown) => setQueue(await api.post<QueueState>(path, body));

  return (
    <div class="card">
      <h3>Queue operator</h3>
      <p class="muted">Now serving: <strong>{queue?.now_serving ?? "—"}</strong> · waiting: {queue?.waiting ?? "—"}</p>
      <div class="row wrap">
        <button class="primary" onClick={() => act("/api/queues/default/advance")}>Next +1</button>
        <button onClick={() => act("/api/queues/default/waiting", { delta: 1 })}>Waiting +1</button>
        <button onClick={() => act("/api/queues/default/waiting", { delta: -1 })}>Waiting −1</button>
        <button class="danger" onClick={() => act("/api/queues/default/reset")}>Reset</button>
      </div>
    </div>
  );
}
