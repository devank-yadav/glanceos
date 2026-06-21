import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../api";
import { Icon } from "../editor/icons";
import { fmtAgo } from "../util";
import { IconButton } from "./IconButton";

interface Notification { id: number; deviceId: string | null; kind: string; message: string; createdAt: number; read: boolean }
interface Feed { notifications: Notification[]; unread: number }

// Bell in the sidebar foot: polls the alert feed, badges the unread count, and
// drops down a panel. Clicking an item (or "Mark all read") clears it.
export function NotificationsBell() {
  const [feed, setFeed] = useState<Feed>({ notifications: [], unread: 0 });
  const [open, setOpen] = useState(false);
  // The panel is pinned with fixed coords measured from the bell, so the sidebar's
  // own scroll/overflow can't clip or mis-place it.
  const [pos, setPos] = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const load = () => api.get<Feed>("/api/notifications").then(setFeed).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      // Anchor above the bell; clamp so the panel (≤ ~360px tall) stays on-screen.
      const bottom = Math.round(window.innerHeight - r.top + 8);
      setPos({ left: Math.max(8, r.left), bottom: Math.max(8, Math.min(bottom, window.innerHeight - 360)) });
    }
    setOpen(true);
  };
  const markRead = async (id: number) => { await api.post(`/api/notifications/${id}/read`).catch(() => {}); load(); };
  const markAll = async () => { await api.post("/api/notifications/read-all").catch(() => {}); load(); };
  const clearAll = async () => { await api.post("/api/notifications/clear-all").catch(() => {}); load(); };

  return (
    <div class="notif-wrap" ref={ref}>
      <IconButton
        class={`notif-bell${feed.unread > 0 ? " has-unread" : ""}`}
        icon={<Icon.bell />}
        label={feed.unread > 0 ? `Notifications (${feed.unread} unread)` : "Notifications"}
        onClick={toggle}
      />
      {feed.unread > 0 && <span class="notif-badge" aria-hidden="true">{feed.unread > 9 ? "9+" : feed.unread}</span>}
      {open && (
        <div class="notif-panel card" role="dialog" aria-label="Notifications" style={{ position: "fixed", left: `${pos.left}px`, bottom: `${pos.bottom}px`, top: "auto" }}>
          <div class="row spread notif-head">
            <strong>Notifications</strong>
            <span class="row notif-head-actions">
              {feed.unread > 0 && <button class="ghost" onClick={markAll}>Mark all read</button>}
              {feed.notifications.length > 0 && <button class="ghost" onClick={clearAll}>Clear all</button>}
            </span>
          </div>
          {feed.notifications.length === 0 ? (
            <p class="muted notif-empty">You're all caught up.</p>
          ) : (
            <ul class="notif-list">
              {feed.notifications.map((n) => (
                <li key={n.id} class={`notif-item${n.read ? " read" : ""}`}>
                  <button class="notif-item-btn" onClick={() => !n.read && markRead(n.id)} title={n.read ? "" : "Mark read"}>
                    <span class={`notif-dot ${n.kind}`} aria-hidden="true" />
                    <span class="notif-msg">{n.message}</span>
                    <span class="notif-time muted">{fmtAgo(n.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
