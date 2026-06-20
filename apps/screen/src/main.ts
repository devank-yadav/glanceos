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
  const pwKey = `glanceos.share.pw.${token}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { renderPayload(JSON.parse(cached) as StreamPayloadT); markStale(); } catch { localStorage.removeItem(cacheKey); }
  }
  const load = async () => {
    const pw = localStorage.getItem(pwKey);
    const res = await fetch(`/api/public/board/${encodeURIComponent(token)}${pw ? `?pw=${encodeURIComponent(pw)}` : ""}`);
    if (res.status === 401) { localStorage.removeItem(pwKey); throw { needsPassword: true }; }
    if (!res.ok) throw new Error(String(res.status));
    const payload = (await res.json()) as StreamPayloadT;
    localStorage.setItem(cacheKey, JSON.stringify(payload));
    renderPayload(payload);
    markFresh();
  };
  const start = () => load().then(() => { setInterval(() => load().catch(() => markStale()), 60_000); }).catch((e) => {
    if ((e as { needsPassword?: boolean })?.needsPassword) {
      promptPassword(`This board is password protected.`, (pw) => { localStorage.setItem(pwKey, pw); start(); });
    } else if (!cached) {
      renderMessage("This board isn't available", "The share link may have been turned off.");
      markStale();
    } else { markStale(); }
  });
  start();
}

/** Minimal password gate for a protected share (DOM-built, no framework). */
function promptPassword(message: string, onSubmit: (pw: string) => void): void {
  const root = document.getElementById("root") ?? document.body;
  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "share-gate";
  const h = document.createElement("p");
  h.className = "share-gate-msg";
  h.textContent = message;
  const input = document.createElement("input");
  input.type = "password";
  input.placeholder = "Password";
  input.className = "share-gate-input";
  const btn = document.createElement("button");
  btn.className = "share-gate-btn";
  btn.textContent = "View board";
  const submit = () => { if (input.value) onSubmit(input.value); };
  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  wrap.append(h, input, btn);
  root.appendChild(wrap);
  input.focus();
}

const params = new URLSearchParams(location.search);
if (params.has("preview")) {
  bootPreview();
} else if (params.get("share")) {
  bootShare(params.get("share")!);
} else {
  bootScreen();
}
