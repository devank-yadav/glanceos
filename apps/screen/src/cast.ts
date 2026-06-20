import { enableTvMode } from "./tv";

// Chromecast receiver. The receiver page (/screen/?cast=1) runs on the Cast
// device; a sender (the config app) launches it and posts a board's share token
// over this namespace. We then hand off to share mode — no device secret ever
// crosses the Cast channel. Best-effort: outside a real Cast context (a normal
// browser, or casting not configured so the CSP blocks the SDK) the placeholder
// just stays up. The SDK is loaded only here, only in cast mode.
export const CAST_NAMESPACE = "urn:x-cast:com.glanceos.cast";
const RECEIVER_SDK = "https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js";

/** Pure: pull a share token out of a cast custom message, or null. */
export function parseCastMessage(data: unknown): { shareToken: string } | null {
  if (!data || typeof data !== "object") return null;
  const m = data as { type?: unknown; shareToken?: unknown };
  if (m.type === "board" && typeof m.shareToken === "string" && m.shareToken) return { shareToken: m.shareToken };
  return null;
}

/** Boot the Cast receiver; calls onBoard(shareToken) when a board is cast. */
export function bootCast(onBoard: (shareToken: string) => void): void {
  enableTvMode(); // a cast receiver is a TV: fullscreen + wake-lock
  const s = document.createElement("script");
  s.src = RECEIVER_SDK;
  s.onload = () => {
    try {
      const cast = (window as unknown as { cast?: { framework?: { CastReceiverContext: { getInstance: () => { addCustomMessageListener: (ns: string, cb: (e: { data: unknown }) => void) => void; start: () => void } } } } }).cast;
      const ctx = cast?.framework?.CastReceiverContext.getInstance();
      if (!ctx) return; // SDK present but no cast context → stay on placeholder
      ctx.addCustomMessageListener(CAST_NAMESPACE, (e) => {
        const msg = parseCastMessage(e.data);
        if (msg) onBoard(msg.shareToken);
      });
      ctx.start();
    } catch { /* not a cast device — placeholder stays */ }
  };
  s.onerror = () => { /* offline / CSP-blocked (casting not configured) — placeholder stays */ };
  document.head.appendChild(s);
}
