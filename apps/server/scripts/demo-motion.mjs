// D1 motion demo — captures the REAL <30 KB screen runtime rotating a multi-page
// board (the G2 wall-clock page rotation), then encodes a GIF + MP4 hero asset.
// Truth, not a mock: it's the same runtime that ships, fed a board built from two
// contract-tested starter templates (one as page 1, the other as page 2), so the
// motion in the README is exactly what a real screen does. Needs ffmpeg on PATH.
//   cd apps/server && node scripts/demo-motion.mjs
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const DIST = path.join(ROOT, "apps/screen/dist");
const OUT = path.join(ROOT, "docs/images");
fs.mkdirSync(OUT, { recursive: true });
const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), "glanceos-motion-"));

// Two visually-contrasting starter boards → page 1 + page 2 of one rotating board.
const mod = await import(path.join(ROOT, "apps/config/src/starterTemplates.ts"));
const byId = new Map(mod.STARTER_TEMPLATES.map((t) => [t.id, t]));
// Two boards that render fully from static content (no live-data placeholders):
// a glanceable live clock ↔ a café signage menu — the "any screen" story in motion.
const pageA = byId.get("big-clock");
const pageB = byId.get("cafe-menu-classic");
if (!pageA || !pageB) { console.error("missing template(s)"); process.exit(1); }
// Page 0 = rows; extra pages live in `pages`. Rotate every 3 s (schema minimum).
const doc = { ...pageA.doc, pages: [pageB.doc.rows], pageRotateSeconds: 3 };

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]).replace(/^\/screen/, "");
  if (p === "/" || p === "" || !path.extname(p)) p = "/index.html";
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const W = 1280, H = 720, FRAMES = 32, INTERVAL_MS = 250; // ~8 s → ~2-3 page flips at 3 s each
const b = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu"] });
const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(`${base}/screen/?preview=1`, { waitUntil: "load", timeout: 15000 });
await page.evaluate((p) => window.postMessage({ type: "glanceos:state", payload: p }, "*"), { claimed: true, state: { layoutVersion: 1, layout: doc, data: {} } });
await page.waitForTimeout(700);
for (let i = 0; i < FRAMES; i++) {
  await page.screenshot({ path: path.join(frameDir, `frame-${String(i).padStart(3, "0")}.png`), clip: { x: 0, y: 0, width: W, height: H } });
  await page.waitForTimeout(INTERVAL_MS);
}
await b.close();
server.close();

// Encode with ffmpeg: a 2-pass palette GIF (clean colours) + an MP4 (PH/Twitter).
const fps = Math.round(1000 / INTERVAL_MS); // playback ≈ real time
const scale = "scale=860:-1:flags=lanczos";
const inGlob = path.join(frameDir, "frame-%03d.png");
const palette = path.join(frameDir, "palette.png");
const ff = (args) => execFileSync("ffmpeg", ["-y", ...args], { stdio: ["ignore", "ignore", "inherit"] });
ff(["-framerate", String(fps), "-i", inGlob, "-vf", `${scale},palettegen=stats_mode=diff`, palette]);
ff(["-framerate", String(fps), "-i", inGlob, "-i", palette, "-lavfi", `${scale}[x];[x][1:v]paletteuse=dither=bayer`, path.join(OUT, "demo.gif")]);
ff(["-framerate", String(fps), "-i", inGlob, "-vf", `${scale},format=yuv420p`, "-r", "24", "-movflags", "+faststart", path.join(OUT, "demo.mp4")]);

fs.rmSync(frameDir, { recursive: true, force: true });
const kb = (f) => Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
console.log(`done → docs/images/demo.gif (${kb("demo.gif")} KB), demo.mp4 (${kb("demo.mp4")} KB)`);
