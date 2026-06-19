import "./style.css";
import type { StreamPayloadT } from "@glanceos/schema";
import { ensureIdentity, openStream } from "./api";
import { markFresh, markStale, renderMessage, renderPayload } from "./render";

const CACHE_KEY = "glanceos.lastPayload";

/**
 * Preview mode: the config studio embeds this exact runtime in an iframe and
 * posts draft state into it — same renderer as real screens, zero drift.
 */
function bootPreview(): void {
  window.addEventListener("message", (e: MessageEvent) => {
    const msg = e.data as { type?: string; payload?: StreamPayloadT };
    if (msg?.type === "glanceos:state" && msg.payload) {
      try {
        renderPayload(msg.payload);
      } catch {
        // a half-built draft may not render; keep the last good frame
      }
    }
  });
  window.parent.postMessage({ type: "glanceos:ready" }, "*");
}

/**
 * Real screens: dumb glass, not amnesiac — paint the cached state immediately,
 * then let the live stream overwrite it. A server restart never blanks a wall.
 */
function bootScreen(): void {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      renderPayload(JSON.parse(cached) as StreamPayloadT);
      markStale();
    } catch {
      localStorage.removeItem(CACHE_KEY);
    }
  }

  (async () => {
    const identity = await ensureIdentity();
    openStream(identity, {
      onState: (payload) => {
        localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
        renderPayload(payload);
        markFresh();
      },
      onDown: () => markStale(), // EventSource reconnects on its own
    });
  })().catch(() => {
    if (!cached) {
      renderMessage("Can't reach the server", "Check that the GlanceOS server is running, then reload.");
    }
    markStale();
  });
}

/**
 * Public share mode: a read-only board viewable with no login at
 * /screen/?share=<token>. Polls the public endpoint (no SSE), painting the last
 * good frame from cache first so a reload never blanks the wall.
 */
function bootShare(token: string): void {
  const cacheKey = `glanceos.share.${token}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { renderPayload(JSON.parse(cached) as StreamPayloadT); markStale(); } catch { localStorage.removeItem(cacheKey); }
  }
  const load = async () => {
    const res = await fetch(`/api/public/board/${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error(String(res.status));
    const payload = (await res.json()) as StreamPayloadT;
    localStorage.setItem(cacheKey, JSON.stringify(payload));
    renderPayload(payload);
    markFresh();
  };
  load().catch(() => {
    if (!cached) renderMessage("This board isn't available", "The share link may have been turned off.");
    markStale();
  });
  setInterval(() => { load().catch(() => markStale()); }, 60_000);
}

const params = new URLSearchParams(location.search);
if (params.has("preview")) {
  bootPreview();
} else if (params.get("share")) {
  bootShare(params.get("share")!);
} else {
  bootScreen();
}
