// One-off visual-kit renderer (D1): screenshots the REAL <30 KB screen runtime
// rendering a handful of starter-template boards, so the README images are the
// truth — never a parallel mock. Run from apps/server (where playwright lives):
//   node ../../scripts/render-kit.mjs
// Serves apps/screen/dist on an ephemeral port, posts each board into the
// preview runtime exactly like the Studio does, and writes palette PNGs.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const DIST = path.join(ROOT, "apps/screen/dist");
const OUT = path.join(ROOT, "docs/images");
fs.mkdirSync(OUT, { recursive: true });

const PICK = [
  "big-clock", "weather-hero", "today-agenda", "kpi-hero",
  "cafe-menu-classic", "welcome-sign-hero", "transit-departures", "fin-watchlist",
];

const mod = await import(path.join(ROOT, "apps/config/src/starterTemplates.ts"));
const byId = new Map(mod.STARTER_TEMPLATES.map((t) => [t.id, t]));

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]).replace(/^\/screen/, ""); // Vite base is /screen/
  if (p === "/" || p === "" || !path.extname(p)) p = "/index.html";
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const W = 1280, H = 800;
const b = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu"] });
for (const id of PICK) {
  const t = byId.get(id);
  if (!t) { console.log("skip (missing):", id); continue; }
  const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  try {
    await page.goto(`${base}/screen/?preview=1`, { waitUntil: "load", timeout: 15000 });
    const payload = { claimed: true, state: { layoutVersion: 1, layout: t.doc, data: {} } };
    await page.evaluate((p) => window.postMessage({ type: "glanceos:state", payload: p }, "*"), payload);
    await page.waitForTimeout(800); // let the DOM paint + ticking widgets settle
    const buf = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
    await sharp(buf).png({ palette: true, compressionLevel: 9 }).toFile(path.join(OUT, `board-${id}.png`));
    console.log("rendered:", id);
  } catch (e) {
    console.log("FAIL:", id, String(e).split("\n")[0]);
  } finally {
    await page.close().catch(() => {});
  }
}
await b.close();
server.close();
console.log("done →", OUT);
