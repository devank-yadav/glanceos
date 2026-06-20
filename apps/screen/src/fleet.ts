import type { FleetCommand } from "./api";

// Fleet commands delivered over SSE (server: emitGroupCommand). Tiny and
// dependency-free; the tv/native shells can extend this switch (e.g. a real
// "screenshot-now"). On the web runtime, "screenshot-now" is a no-op — the
// server already renders via /api/devices/me/render.bmp.
export function handleFleetCommand(cmd: FleetCommand): void {
  switch (cmd.command) {
    case "reload":
      location.reload();
      break;
    case "clear-cache":
      try { localStorage.clear(); } catch { /* ignore */ }
      location.reload();
      break;
    case "identify":
      flashIdentify(typeof cmd.params?.label === "string" ? cmd.params.label : "This screen");
      break;
  }
}

/** Briefly cover the screen with a high-contrast label so an operator can spot
 *  which physical displays belong to a group. */
export function flashIdentify(label: string, ms = 5000): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-identify", "1");
  el.textContent = label;
  Object.assign(el.style, {
    position: "fixed", inset: "0", display: "flex", alignItems: "center", justifyContent: "center",
    font: "700 6vw system-ui, sans-serif", color: "#fff", background: "rgba(0,0,0,0.82)",
    zIndex: "99999", textAlign: "center", letterSpacing: "0.02em",
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
  return el;
}
