import { useEffect, useState } from "preact/hooks";
import { api, type Playlist, type SetupSummary } from "../api";

// Playlists make a screen rotate through several setups on a schedule.
export function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [setups, setSetups] = useState<SetupSummary[]>([]);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      setPlaylists(await api.get<Playlist[]>("/api/playlists"));
      setSetups(await api.get<SetupSummary[]>("/api/layouts"));
      setError("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  if (playlists === null) return <p class="muted">Loading…</p>;

  const create = async () => {
    await api.post("/api/playlists", { name: "New playlist", intervalSeconds: 300 });
    await refresh();
  };

  return (
    <>
      <div class="row spread">
        <h2>Playlists</h2>
        <button class="primary" onClick={create}>New playlist</button>
      </div>
      <p class="muted">
        A playlist rotates a screen through several setups. Assign it to a screen on the
        <a href="#/"> Screens</a> page. Browser screens advance live; e-ink devices get the current one each poll.
      </p>
      {error && <p class="issues">{error}</p>}
      {playlists.length === 0 ? (
        <p class="muted">No playlists yet. Create one and add a few setups.</p>
      ) : (
        <div class="cards">
          {playlists.map((p) => (
            <PlaylistCard key={p.id} playlist={p} setups={setups} onChanged={refresh} />
          ))}
        </div>
      )}
    </>
  );
}

function PlaylistCard({ playlist, setups, onChanged }: { playlist: Playlist; setups: SetupSummary[]; onChanged: () => Promise<void> }) {
  const [name, setName] = useState(playlist.name);
  const [interval, setInterval] = useState(playlist.intervalSeconds);
  const [chosen, setChosen] = useState<number[]>(playlist.items.map((i) => i.layoutId));
  const [saved, setSaved] = useState(false);

  const toggle = (id: number) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const move = (id: number, dir: -1 | 1) =>
    setChosen((c) => {
      const i = c.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= c.length) return c;
      const next = [...c];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const save = async () => {
    await api.patch(`/api/playlists/${playlist.id}`, { name, intervalSeconds: interval, layoutIds: chosen });
    setSaved(true);
    await onChanged();
  };

  const ordered = [...chosen.map((id) => setups.find((s) => s.id === id)).filter(Boolean)] as SetupSummary[];
  const unchosen = setups.filter((s) => !chosen.includes(s.id));

  return (
    <div class="card">
      <div class="row spread">
        <input value={name} onInput={(e) => { setName((e.currentTarget as HTMLInputElement).value); setSaved(false); }} />
        <button class="danger" onClick={() => api.del(`/api/playlists/${playlist.id}`).then(onChanged)}>Delete</button>
      </div>
      <label class="field" style={{ marginTop: "10px" }}>
        <span>Each setup shows for (seconds)</span>
        <input type="number" value={interval} onInput={(e) => { setInterval(Number((e.currentTarget as HTMLInputElement).value) || 5); setSaved(false); }} />
      </label>
      <h4>In this playlist ({ordered.length})</h4>
      {ordered.length === 0 && <p class="muted">Add setups below.</p>}
      <ol class="playlist-items">
        {ordered.map((s) => (
          <li key={s.id} class="row spread">
            <span>{s.name}</span>
            <span class="row">
              <button class="ghost" title="Up" onClick={() => { move(s.id, -1); setSaved(false); }}>↑</button>
              <button class="ghost" title="Down" onClick={() => { move(s.id, 1); setSaved(false); }}>↓</button>
              <button class="ghost" title="Remove" onClick={() => { toggle(s.id); setSaved(false); }}>✕</button>
            </span>
          </li>
        ))}
      </ol>
      {unchosen.length > 0 && (
        <>
          <h4>Add a setup</h4>
          <div class="row wrap">
            {unchosen.map((s) => (
              <button key={s.id} class="ghost chip-btn" onClick={() => { toggle(s.id); setSaved(false); }}>+ {s.name}</button>
            ))}
          </div>
        </>
      )}
      <div class="row spread" style={{ marginTop: "12px" }}>
        {saved ? <span class="ok">Saved</span> : <span />}
        <button class="primary" onClick={save}>Save playlist</button>
      </div>
    </div>
  );
}
