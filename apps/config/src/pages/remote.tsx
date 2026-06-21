import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { Icon } from "../editor/icons";

// A phone-first "Remote": from your pocket, flick a board onto a screen, nudge it
// (reload / identify), and clear notifications. Reuses the same session + REST API
// as the rest of the app; pairs with the PWA so it installs to the home screen.

interface Screen { id: string; name: string | null; online: boolean; layoutId: number | null; layoutName: string | null }
interface Board { id: number; name: string }
interface Note { id: number; kind: string; message: string; createdAt: number; read: boolean }
interface Feed { notifications: Note[]; unread: number }

export function RemotePage() {
  const [screens, setScreens] = useState<Screen[] | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [feed, setFeed] = useState<Feed | null>(null);
  const toast = useToast();

  const loadScreens = () => api.get<Screen[]>("/api/devices").then(setScreens).catch(() => setScreens([]));
  const loadFeed = () => api.get<Feed>("/api/notifications").then(setFeed).catch(() => {});
  useEffect(() => {
    loadScreens();
    api.get<Board[]>("/api/layouts").then(setBoards).catch(() => {});
    loadFeed();
    const t = setInterval(() => { loadScreens(); loadFeed(); }, 30_000); // keep it live
    return () => clearInterval(t);
  }, []);

  const assign = async (s: Screen, layoutId: number) => {
    try { await api.patch(`/api/devices/${s.id}`, { layoutId }); toast.success("Board sent"); await loadScreens(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const command = async (s: Screen, cmd: string) => {
    try {
      const r = await api.post<{ delivered: number }>(`/api/devices/${s.id}/command`, { command: cmd });
      toast.success(r.delivered ? (cmd === "identify" ? "Pinged the screen" : "Reloading") : "Screen is offline");
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const markRead = async (id: number) => { await api.post(`/api/notifications/${id}/read`).catch(() => {}); await loadFeed(); };
  const markAll = async () => { await api.post("/api/notifications/read-all").catch(() => {}); await loadFeed(); };

  return (
    <>
      <PageHeader title="Remote" />
      <div class="shell-content remote">
        <p class="muted page-intro">Control your screens from your phone — switch the board showing on each, give it a nudge, and clear alerts. Add this to your home screen for one-tap access.</p>

        {screens === null ? (
          <div class="cards">{[0, 1].map((i) => <div key={i} class="skeleton skeleton-card" />)}</div>
        ) : screens.length === 0 ? (
          <EmptyState icon={<Icon.monitor />} title="No screens yet" body="Claim a screen first, then control it from here." />
        ) : (
          <div class="remote-screens">
            {screens.map((s) => (
              <div key={s.id} class="card remote-card">
                <div class="row spread">
                  <h3 class="card-title">{s.name || "Screen"}</h3>
                  <span class={`chip ${s.online ? "published" : "subtle"}`}>{s.online ? "online" : "offline"}</span>
                </div>
                <label class="field"><span>Showing</span>
                  <select value={s.layoutId ?? ""} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; if (v) assign(s, Number(v)); }}>
                    <option value="" disabled>{s.layoutName || "Pick a board…"}</option>
                    {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <div class="row remote-actions">
                  <button class="ghost" disabled={!s.online} onClick={() => command(s, "reload")}><Icon.convert /> Reload</button>
                  <button class="ghost" disabled={!s.online} onClick={() => command(s, "identify")}><Icon.target /> Identify</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {feed && feed.notifications.length > 0 && (
          <section class="card account-section remote-feed">
            <div class="row spread">
              <h2>Alerts {feed.unread > 0 && <span class="chip">{feed.unread}</span>}</h2>
              {feed.unread > 0 && <button class="ghost" onClick={markAll}>Mark all read</button>}
            </div>
            <ul class="picker-list">
              {feed.notifications.slice(0, 12).map((n) => (
                <li key={n.id} class={`row spread ${n.read ? "muted" : ""}`}>
                  <span class="key-meta"><strong>{n.message}</strong><span class="muted">{n.kind} · {new Date(n.createdAt).toLocaleString()}</span></span>
                  {!n.read && <button class="ghost" onClick={() => markRead(n.id)}>Read</button>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
