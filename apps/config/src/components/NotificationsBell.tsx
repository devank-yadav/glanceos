import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../api";
import { Icon } from "../editor/icons";
import { fmtAgo } from "../util";
import { IconButton } from "./IconButton";
import { BANNER_CAP, freshSince } from "./notifyDiff";

// (NotifRow, not "Notification" — that name would shadow the DOM banner API below.)
interface NotifRow { id: number; deviceId: string | null; kind: string; message: string; createdAt: number; read: boolean; archived?: boolean }
interface Feed { notifications: NotifRow[]; unread: number }

// A spoken label for the colour-coded dot, so the kind isn't conveyed by colour alone.
const KIND_LABELS: Record<string, string> = { offline: "Offline", online: "Online", low_battery: "Low battery", low: "Low battery", conn: "Integration", error: "Error", info: "Info" };
const kindLabel = (k: string): string => KIND_LABELS[k] ?? k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// #45 — desktop banners: opt-in per device (localStorage), page-open only — the same
// 30s poll that feeds the bell also raises Notification banners for what's new. No
// push service, no service worker: honest v1, works exactly while a GlanceOS tab is
// open. The wall stays read-only; banners land on the phone/laptop, where acting lives.
const NOTIF_PREF = "glanceos.desktopNotifs";
const SEEN_KEY = "glanceos.notifSeenId";

// Bell in the sidebar foot: polls the alert feed, badges the unread count, and
// drops down a panel. Clicking an item (or "Mark all read") clears it.
export function NotificationsBell() {
  const [feed, setFeed] = useState<Feed>({ notifications: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const supported = typeof Notification !== "undefined";
  const [desktop, setDesktopState] = useState(() => supported && localStorage.getItem(NOTIF_PREF) === "1" && Notification.permission === "granted");
  const [denied, setDenied] = useState(() => supported && Notification.permission === "denied");
  // The poll's load() closure is created once — a ref keeps the live toggle visible to it.
  const desktopRef = useRef(desktop);
  const setDesktop = (v: boolean) => { desktopRef.current = v; setDesktopState(v); };
  // The panel is pinned with fixed coords measured from the bell, so the sidebar's
  // own scroll/overflow can't clip or mis-place it.
  const [pos, setPos] = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Watermark ALWAYS advances (even while banners are off), so switching them on
  // later never replays old notifications as a burst.
  const maybeNotify = (f: Feed) => {
    const seen = Number(localStorage.getItem(SEEN_KEY) || 0);
    const { fresh, maxId } = freshSince(f.notifications, seen);
    if (maxId > seen) localStorage.setItem(SEEN_KEY, String(maxId));
    if (!desktopRef.current || !supported || Notification.permission !== "granted") return;
    for (const n of fresh.slice(0, BANNER_CAP)) new Notification(`GlanceOS — ${kindLabel(n.kind)}`, { body: n.message, tag: `glanceos-notif-${n.id}` });
    if (fresh.length > BANNER_CAP) new Notification("GlanceOS", { body: `…and ${fresh.length - BANNER_CAP} more notifications`, tag: "glanceos-notif-more" });
  };

  const load = () => api.get<Feed>("/api/notifications").then((f) => { setFeed(f); maybeNotify(f); }).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    // Move focus into the portaled panel so keyboard users can reach its controls,
    // and restore focus to the bell when it closes (role=dialog focus contract).
    const focus = setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      clearTimeout(focus);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      (ref.current?.querySelector(".notif-bell") as HTMLElement | null)?.focus();
    };
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
  const clearAll = async () => { await api.post("/api/notifications/clear-all").catch(() => {}); load(); };
  // #43 — the history view: everything (active + archived), searchable. "Clear all"
  // archives instead of deleting now, so nothing is ever silently destroyed.
  const [mode, setMode] = useState<"live" | "history">("live");
  const [q, setQ] = useState("");
  const [history, setHistory] = useState<NotifRow[] | null>(null);
  const searchHistory = (query: string) => {
    setQ(query);
    api.get<NotifRow[]>(`/api/notifications/search?all=1&q=${encodeURIComponent(query)}`).then(setHistory).catch(() => setHistory([]));
  };
  const flipMode = () => {
    if (mode === "history") { setMode("live"); return; }
    setMode("history");
    searchHistory("");
  };
  // #45 — flip desktop banners; the first turn-on asks the browser for permission.
  const toggleDesktop = async () => {
    if (!supported) return;
    if (desktop) { localStorage.setItem(NOTIF_PREF, "0"); setDesktop(false); return; }
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    setDenied(perm === "denied");
    if (perm === "granted") { localStorage.setItem(NOTIF_PREF, "1"); setDesktop(true); }
  };

  return (
    <div class="notif-wrap" ref={ref}>
      <IconButton
        class={`notif-bell${feed.unread > 0 ? " has-unread" : ""}`}
        icon={<Icon.bell />}
        label={feed.unread > 0 ? `Notifications (${feed.unread} unread)` : "Notifications"}
        onClick={toggle}
      />
      {feed.unread > 0 && <span class="notif-badge" aria-hidden="true">{feed.unread > 9 ? "9+" : feed.unread}</span>}
      {open && createPortal(
        <div ref={panelRef} class="notif-panel" role="dialog" aria-label="Notifications" style={{ position: "fixed", left: `${pos.left}px`, bottom: `${pos.bottom}px`, top: "auto" }}>
          <div class="row spread notif-head">
            <strong>{mode === "history" ? "History" : "Notifications"}</strong>
            <div class="row" style={{ gap: "4px" }}>
              {supported && mode === "live" && (
                <button
                  class="ghost"
                  onClick={toggleDesktop}
                  aria-pressed={desktop}
                  disabled={denied}
                  title={denied ? "Notifications are blocked in your browser's site settings" : "Show desktop banners for new alerts while GlanceOS is open in a tab"}
                >
                  {denied ? "Banners blocked" : desktop ? "Banners: on" : "Banners: off"}
                </button>
              )}
              <button class="ghost" onClick={flipMode} aria-pressed={mode === "history"} title={mode === "history" ? "Back to current notifications" : "Browse and search everything, including cleared alerts"}>
                {mode === "history" ? "Current" : "History"}
              </button>
              {mode === "live" && feed.notifications.length > 0 && <button class="ghost" onClick={clearAll} title="Moves everything to History">Clear all</button>}
            </div>
          </div>
          {mode === "history" && (
            <input
              class="notif-search"
              type="search"
              placeholder="Search alerts…"
              value={q}
              onInput={(e) => searchHistory((e.currentTarget as HTMLInputElement).value)}
            />
          )}
          {(mode === "history" ? (history ?? []) : feed.notifications).length === 0 ? (
            <p class="muted notif-empty">{mode === "history" ? (history === null ? "Loading…" : q ? "No alerts match." : "No history yet.") : "You're all caught up."}</p>
          ) : (
            <ul class="notif-list" aria-live="polite">
              {(mode === "history" ? (history ?? []) : feed.notifications).map((n) => (
                <li key={n.id} class={`notif-item${n.read ? " read" : ""}`}>
                  <button class="notif-item-btn" onClick={() => mode === "live" && !n.read && markRead(n.id)} title={mode === "live" && !n.read ? "Mark read" : ""}>
                    <span class={`notif-dot ${n.kind}`} aria-hidden="true" />
                    <span class="sr-only">{kindLabel(n.kind)}: </span>
                    <span class="notif-msg">{n.message}</span>
                    <span class="notif-time muted">{fmtAgo(n.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
