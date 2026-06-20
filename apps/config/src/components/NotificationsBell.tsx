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
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const markRead = async (id: number) => { await api.post(`/api/notifications/${id}/read`).catch(() => {}); load(); };
  const markAll = async () => { await api.post("/api/notifications/read-all").catch(() => {}); load(); };

  return (
    <div class="notif-wrap" ref={ref}>
      <IconButton
        class={`notif-bell${feed.unread > 0 ? " has-unread" : ""}`}
        icon={<Icon.bell />}
        label={feed.unread > 0 ? `Notifications (${feed.unread} unread)` : "Notifications"}
        onClick={() => setOpen((v) => !v)}
      />
      {feed.unread > 0 && <span class="notif-badge" aria-hidden="true">{feed.unread > 9 ? "9+" : feed.unread}</span>}
      {open && (
        <div class="notif-panel card" role="dialog" aria-label="Notifications">
          <div class="row spread notif-head">
            <strong>Notifications</strong>
            {feed.unread > 0 && <button class="ghost" onClick={markAll}>Mark all read</button>}
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
