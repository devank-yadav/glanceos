// GlanceOS config PWA service worker. Deliberately minimal + SSE-SAFE:
//  - Only ever handles same-origin GET.
//  - NEVER intercepts /api/* (incl. the SSE stream), /screen/*, /uploads/*, or any
//    text/event-stream request — those fall through to the network untouched, so
//    live updates and the screen runtime are unaffected.
//  - Caches only content-hashed /assets/* (immutable → cache-first).
//  - Serves the cached app shell as an offline fallback for SPA navigations.

const CACHE = "glanceos-shell-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add("/index.html")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Hands off the API (SSE included), the screen runtime, and uploads to the network.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/screen") || url.pathname.startsWith("/uploads")) return;
  if ((req.headers.get("accept") || "").includes("text/event-stream")) return;

  // Hashed build assets never change under their name → cache-first.
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // SPA navigations → network-first, fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/index.html").then((r) => r || Response.error())));
  }
});
