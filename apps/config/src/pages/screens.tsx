import { useEffect, useState } from "preact/hooks";
import { api, type DeviceSummary, type Playlist, type QueueState, type SetupSummary, type TaskItem } from "../api";
import { navigate } from "../router";

export function ScreensPage() {
  const [devices, setDevices] = useState<DeviceSummary[] | null>(null);
  const [setups, setSetups] = useState<SetupSummary[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      setDevices(await api.get<DeviceSummary[]>("/api/devices"));
      setSetups(await api.get<SetupSummary[]>("/api/layouts"));
      setPlaylists(await api.get<Playlist[]>("/api/playlists"));
      setError("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  if (devices === null) return <p class="muted">Loading…</p>;

  return (
    <>
      {error && <p class="issues">{error}</p>}
      {devices.length === 0 ? (
        <EmptyState onClaimed={async (id) => { await refresh(); setPickerFor(id); }} />
      ) : (
        <>
          <h2>Screens</h2>
          <div class="cards">
            {devices.map((d) => (
              <DeviceCard
                key={d.id}
                device={d}
                playlists={playlists}
                onChanged={refresh}
                onPick={() => setPickerFor(d.id)}
              />
            ))}
            <ClaimCard compact onClaimed={async (id) => { await refresh(); setPickerFor(id); }} />
          </div>
        </>
      )}
      {pickerFor && (
        <SetupPicker
          deviceId={pickerFor}
          setups={setups}
          playlists={playlists}
          onClose={() => setPickerFor(null)}
          onDone={refresh}
        />
      )}
      <DataPanels />
    </>
  );
}

function EmptyState({ onClaimed }: { onClaimed: (deviceId: string) => Promise<void> }) {
  return (
    <div class="empty-state">
      <h1>Connect your first screen</h1>
      <ol class="muted steps">
        <li>Open the screen app on any display with a browser — <code>http://&lt;this-server&gt;/screen</code> (or <code>http://localhost:5173</code> in dev).</li>
        <li>The screen registers itself and shows a short claim code.</li>
        <li>Type the code here and the screen becomes yours.</li>
      </ol>
      <ClaimCard onClaimed={onClaimed} />
    </div>
  );
}

function ClaimCard({ compact, onClaimed }: { compact?: boolean; onClaimed: (deviceId: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  const claim = async () => {
    setMessage("");
    try {
      const device = await api.post<DeviceSummary>("/api/devices/claim", {
        code,
        name: name.trim() || undefined,
      });
      setCode("");
      setName("");
      await onClaimed(device.id);
    } catch (e) {
      setMessage(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <div class={compact ? "card claim-card" : "card"}>
      {compact && <h3>Connect another screen</h3>}
      <div class="row wrap">
        <label class="field">
          <span>Claim code</span>
          <input placeholder="7QK-D2F" value={code} onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Screen name</span>
          <input placeholder="Desk monitor" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <button class="primary" disabled={code.trim().length < 4} onClick={claim}>
          Claim
        </button>
      </div>
      {message && <p class="issues">{message}</p>}
    </div>
  );
}

function DeviceCard({
  device,
  playlists,
  onChanged,
  onPick,
}: {
  device: DeviceSummary;
  playlists: Playlist[];
  onChanged: () => Promise<void>;
  onPick: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(device.name ?? "");
  const [previewing, setPreviewing] = useState(false);

  const rename = async () => {
    await api.patch(`/api/devices/${device.id}`, { name });
    setRenaming(false);
    await onChanged();
  };
  const setRefresh = async (seconds: number) => {
    await api.patch(`/api/devices/${device.id}`, { refreshSeconds: seconds });
    await onChanged();
  };
  const disconnect = async () => {
    await api.del(`/api/devices/${device.id}`);
    await onChanged();
  };

  const playlist = device.playlistId ? playlists.find((p) => p.id === device.playlistId) : undefined;

  return (
    <div class="card device-card">
      <div class="row spread">
        <div class="row">
          <span class={device.online ? "dot online" : "dot"} title={device.online ? "online" : "offline"} />
          {renaming ? (
            <input value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && rename()} />
          ) : (
            <strong>{device.name ?? "Unnamed screen"}</strong>
          )}
        </div>
        {renaming ? <button onClick={rename}>Save</button> : <button class="ghost" onClick={() => setRenaming(true)}>Rename</button>}
      </div>

      <p class="muted setup-line">
        {playlist ? (
          <>Playing <strong>{playlist.name}</strong> · {playlist.items.length} setups</>
        ) : device.layoutName ? (
          <>Showing <strong>{device.layoutName}</strong></>
        ) : (
          <>No setup yet — choose one</>
        )}
      </p>

      <div class="telemetry muted">
        <span title="Resolution">▦ {device.resolution}</span>
        <span title="Refresh interval">⟳ {fmtDuration(device.refreshSeconds)}</span>
        {device.battery !== null && <span title="Battery">🔋 {device.battery}%</span>}
        {device.rssi !== null && <span title="Wi-Fi signal">📶 {device.rssi} dBm</span>}
        {device.lastSeen && <span title="Last device contact">⌁ {fmtAgo(device.lastSeen)}</span>}
      </div>

      {previewing && (
        <div class="eink-preview">
          <img src={`/api/devices/${device.id}/preview.png?t=${Date.now()}`} alt="e-ink preview" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
          <span class="muted">1-bit e-ink render</span>
        </div>
      )}

      <div class="row wrap">
        {device.layoutId !== null && (
          <button class="primary" onClick={() => navigate(`/edit/${device.layoutId}`)}>Open studio</button>
        )}
        <button onClick={onPick}>Change content</button>
        <button class="ghost" onClick={() => setPreviewing((v) => !v)}>{previewing ? "Hide preview" : "E-ink preview"}</button>
        <label class="field refresh-field">
          <span>Refresh</span>
          <select value={String(device.refreshSeconds)} onChange={(e) => setRefresh(Number((e.currentTarget as HTMLSelectElement).value))}>
            {[60, 300, 900, 1800, 3600, 21600].map((s) => <option key={s} value={String(s)}>{fmtDuration(s)}</option>)}
          </select>
        </label>
        <button class="danger" title="Content is kept and can be reattached" onClick={disconnect}>Disconnect</button>
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
function SetupPicker({
  deviceId,
  setups,
  playlists,
  onClose,
  onDone,
}: {
  deviceId: string;
  setups: SetupSummary[];
  playlists: Playlist[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const assign = async (layoutId: number, thenEdit = false) => {
    setBusy(true);
    try {
      await api.patch(`/api/devices/${deviceId}`, { layoutId });
      await onDone();
      onClose();
      if (thenEdit) navigate(`/edit/${layoutId}`);
    } finally {
      setBusy(false);
    }
  };

  const assignPlaylist = async (playlistId: number) => {
    setBusy(true);
    try {
      await api.patch(`/api/devices/${deviceId}`, { playlistId });
      await onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const createBlank = async () => {
    setBusy(true);
    try {
      const layout = await api.post<{ id: number }>("/api/layouts", { name: "New setup" });
      await assign(layout.id, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="row spread">
          <h3>Choose a setup for this screen</h3>
          <button class="ghost" onClick={onClose}>✕</button>
        </div>
        <button class="primary wide" disabled={busy} onClick={createBlank}>
          Start blank — open the studio
        </button>
        {setups.length > 0 && (
          <>
            <p class="muted">…or attach an existing setup (screens can share one):</p>
            <ul class="picker-list">
              {setups.map((s) => (
                <li key={s.id} class="row spread">
                  <span>
                    <strong>{s.name}</strong>{" "}
                    <span class="muted">
                      {s.widgetCount} blocks{s.usedBy > 0 ? ` · live on ${s.usedBy}` : ""}
                    </span>
                  </span>
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
        <p class="muted">
          Want a starting point instead? <a href="#/hub" onClick={onClose}>Import from the hub</a>, then attach it here.
        </p>
      </div>
    </div>
  );
}

/** The data behind tasks/queue widgets — relocated from the v0.1 panels. */
function DataPanels() {
  return (
    <details class="data-panels">
      <summary>Widget data: tasks & queue</summary>
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
  useEffect(() => {
    refresh().catch(() => {});
  }, []);

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
          <input
            value={text}
            onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </label>
        <button onClick={add}>Add</button>
      </div>
      <ul class="tasks">
        {items.map((item) => (
          <li key={item.id} class="row spread">
            <label class="field checkbox">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => api.patch(`/api/tasks/${item.id}`, { done: !item.done }).then(refresh)}
              />
              <span class={item.done ? "done" : ""}>{item.text}</span>
            </label>
            <button class="ghost" onClick={() => api.del(`/api/tasks/${item.id}`).then(refresh)}>✕</button>
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
      <p class="muted">
        Now serving: <strong>{queue?.now_serving ?? "—"}</strong> · waiting: {queue?.waiting ?? "—"}
      </p>
      <div class="row wrap">
        <button class="primary" onClick={() => act("/api/queues/default/advance")}>Next +1</button>
        <button onClick={() => act("/api/queues/default/waiting", { delta: 1 })}>Waiting +1</button>
        <button onClick={() => act("/api/queues/default/waiting", { delta: -1 })}>Waiting −1</button>
        <button class="danger" onClick={() => act("/api/queues/default/reset")}>Reset</button>
      </div>
    </div>
  );
}
