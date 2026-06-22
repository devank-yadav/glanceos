import { useEffect, useState } from "preact/hooks";
import { api, type Playlist, type SetupSummary } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { IconButton } from "../components/IconButton";
import { PageHeader } from "../components/PageHeader";
import { ScreensTabs } from "../components/ScreensTabs";
import { useToast } from "../components/Toast";
import { Icon } from "../editor/icons";

// Rotations (formerly "playlists") make a screen cycle through several boards.
export function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [setups, setSetups] = useState<SetupSummary[]>([]);
  const toast = useToast();

  const refresh = async () => {
    try {
      setPlaylists(await api.get<Playlist[]>("/api/playlists"));
      setSetups(await api.get<SetupSummary[]>("/api/layouts"));
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  useEffect(() => { refresh(); }, []);

  const create = async () => {
    await api.post("/api/playlists", { name: "New rotation", intervalSeconds: 300 });
    toast.success("Rotation created");
    await refresh();
  };

  const actions = <button class="primary" onClick={create}><Icon.plus /> New rotation</button>;

  return (
    <>
      <PageHeader title="Rotations" actions={actions} />
      <div class="shell-content">
        <ScreensTabs active="playlists" />
        <p class="muted page-intro">
          A rotation cycles a screen through several boards. Assign it to a screen on the <a href="#/screens">Screens</a> page.
          Browser screens advance live; e-ink devices get the current one each poll.
        </p>
        {playlists === null ? (
          <div class="cards">{[0, 1].map((i) => <div key={i} class="skeleton skeleton-card" />)}</div>
        ) : playlists.length === 0 ? (
          <EmptyState icon={<Icon.play />} title="No rotations yet" body="Create one and add a few boards to cycle." action={{ label: "New rotation", onClick: create }} />
        ) : (
          <div class="cards">
            {playlists.map((p) => <PlaylistCard key={p.id} playlist={p} setups={setups} onChanged={refresh} />)}
          </div>
        )}
      </div>
    </>
  );
}

function PlaylistCard({ playlist, setups, onChanged }: { playlist: Playlist; setups: SetupSummary[]; onChanged: () => Promise<void> }) {
  const [name, setName] = useState(playlist.name);
  const [interval, setInterval] = useState(playlist.intervalSeconds);
  const [chosen, setChosen] = useState<number[]>(playlist.items.map((i) => i.layoutId));
  const [dirty, setDirty] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const change = <T,>(fn: () => T) => { fn(); setDirty(true); };
  const toggle = (id: number) => change(() => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])));
  const move = (id: number, dir: -1 | 1) => change(() => setChosen((c) => {
    const i = c.indexOf(id); const j = i + dir;
    if (i < 0 || j < 0 || j >= c.length) return c;
    const next = [...c]; [next[i], next[j]] = [next[j]!, next[i]!]; return next;
  }));

  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.patch(`/api/playlists/${playlist.id}`, { name, intervalSeconds: interval, layoutIds: chosen });
      setDirty(false);
      toast.success("Rotation saved");
      await onChanged();
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e)); // keep dirty so Save stays enabled to retry
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!(await confirm({ title: `Delete "${name}"?`, confirmLabel: "Delete", danger: true }))) return;
    try { await api.del(`/api/playlists/${playlist.id}`); toast.success("Rotation deleted"); await onChanged(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  const ordered = chosen.map((id) => setups.find((s) => s.id === id)).filter(Boolean) as SetupSummary[];
  const unchosen = setups.filter((s) => !chosen.includes(s.id));

  return (
    <div class="card">
      <div class="row spread">
        <label class="field grow">
          <span>Name</span>
          <input value={name} onInput={(e) => change(() => setName((e.currentTarget as HTMLInputElement).value))} />
        </label>
        <IconButton icon={<Icon.trash />} label="Delete rotation" class="danger-ghost" onClick={remove} />
      </div>
      <label class="field" style={{ marginTop: "10px" }}>
        <span>Each board shows for (seconds)</span>
        <input type="number" value={interval} onInput={(e) => change(() => setInterval(Number((e.currentTarget as HTMLInputElement).value) || 5))} />
      </label>
      <h4>In this rotation ({ordered.length})</h4>
      {ordered.length === 0 && <p class="muted">Add boards below.</p>}
      <ol class="playlist-items">
        {ordered.map((s, i) => (
          <li key={s.id} class="row spread" aria-label={`${i + 1}. ${s.name}`}>
            <span class="playlist-name"><Icon.grip /> {s.name}</span>
            <span class="icon-group">
              <IconButton icon={<Icon.chevron class="rot-up" />} label="Move up" onClick={() => move(s.id, -1)} />
              <IconButton icon={<Icon.chevron class="rot-down" />} label="Move down" onClick={() => move(s.id, 1)} />
              <IconButton icon={<Icon.x />} label="Remove" onClick={() => toggle(s.id)} />
            </span>
          </li>
        ))}
      </ol>
      {unchosen.length > 0 && (
        <>
          <h4>Available boards</h4>
          <div class="row wrap">
            {unchosen.map((s) => (
              <button key={s.id} class="ghost chip-btn" onClick={() => toggle(s.id)}><Icon.plus /> {s.name}</button>
            ))}
          </div>
        </>
      )}
      <div class="row spread" style={{ marginTop: "12px" }}>
        <span class="muted">{dirty ? "Unsaved changes" : "Saved"}</span>
        <button class="primary" disabled={!dirty} onClick={save}>Save rotation</button>
      </div>
    </div>
  );
}
