// Live alerts pushed over SSE (the "alert" event, fired by server automations).
// The banner is appended to document.body — NOT #app, which render.ts wipes on
// every state push — and auto-removes after its ttl. Dependency-free; all styling
// lives in CSS so it costs nothing against the screen JS size budget.

export interface AlertPayload { severity?: "info" | "warn" | "critical"; title?: string; body?: string; ttl?: number }

let timer: ReturnType<typeof setTimeout> | undefined;

export function showAlert(a: AlertPayload): void {
  document.getElementById("glance-alert")?.remove();
  if (timer) clearTimeout(timer);

  const el = document.createElement("div");
  el.id = "glance-alert";
  el.className = `glance-alert sev-${a.severity === "critical" || a.severity === "warn" ? a.severity : "info"}`;
  const title = document.createElement("div");
  title.className = "ga-title";
  title.textContent = a.title || "Alert"; // textContent — never markup
  el.appendChild(title);
  if (a.body) {
    const body = document.createElement("div");
    body.className = "ga-body";
    body.textContent = a.body;
    el.appendChild(body);
  }
  document.body.appendChild(el);

  const ttl = Math.min(3600, Math.max(2, a.ttl || 12)) * 1000;
  timer = setTimeout(() => el.remove(), ttl);
}
