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

if (new URLSearchParams(location.search).has("preview")) {
  bootPreview();
} else {
  bootScreen();
}
