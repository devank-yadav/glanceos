import { serve } from "@hono/node-server";
import { buildApp } from "./api";
import { validateConfig } from "./config";
import { checkpoint, migrate } from "./db";
import { runAlertChecks } from "./notifications";
import { pruneProofOfPlay } from "./playlog";
import { gcRateLimits } from "./ratelimit";
import { undecryptableSecretCount } from "./rotate";
import { seedTemplates } from "./seed";
import { pushAllConnected, pushRotatingDevices, pushScheduledDevices } from "./state";
import { gcUploads } from "./uploads";

validateConfig(); // fail fast on a broken GLANCEOS_* env
migrate();
seedTemplates();

// Rotation safety: warn loudly if stored secrets can't be decrypted with the
// current/previous key (operator changed GLANCEOS_SECRET_KEY without rotating).
const undecryptable = undecryptableSecretCount();
if (undecryptable > 0) {
  console.warn(`[secrets] ${undecryptable} stored secret(s) can't be decrypted — set GLANCEOS_SECRET_KEY_PREVIOUS to the old key and run \`pnpm --filter @glanceos/server rotate-secrets\`. Affected connections will show "needs auth" until then.`);
}

// Optional multi-process scale: fan SSE + rate-limit windows out over Redis.
// Off by default (single process, zero deps). Boot fails loudly if it can't init.
if (process.env.GLANCEOS_REDIS_URL) {
  const { initRedis } = await import("./redis");
  await initRedis(process.env.GLANCEOS_REDIS_URL);
  console.log("[glanceos] Redis scale backend active (SSE fan-out + shared rate limits)");
}

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: buildApp().fetch, port }, (info) => {
  console.log(`[glanceos] server on http://localhost:${info.port}`);
});

// Weather and calendars drift on their own — refresh connected screens periodically.
setInterval(() => {
  pushAllConnected(2 * 60 * 1000).catch(() => {}); // spread over 2 min
}, 5 * 60 * 1000);

// Advance rotating (playlist) screens to their current item.
setInterval(() => {
  pushRotatingDevices(8 * 1000).catch(() => {}); // spread over 8s of the 10s window
}, 10 * 1000);

// Flip scheduled screens at their window boundaries (minute granularity is
// enough). Staggered across ~30s so a big fleet doesn't all recompose at once.
setInterval(() => {
  pushScheduledDevices(30 * 1000).catch(() => {});
}, 60 * 1000);

// Flag offline / low-battery screens as in-app notifications.
setInterval(() => {
  try { runAlertChecks(); } catch { /* never let the sweep crash the loop */ }
}, 60 * 1000);

// Drop expired rate-limit windows so the map stays bounded.
setInterval(() => gcRateLimits(), 5 * 60 * 1000);

// Reclaim upload disk: orphan files always; unreferenced rows only when opted in.
setInterval(() => {
  try { gcUploads({ reclaimUnreferenced: process.env.GLANCEOS_GC_UNREFERENCED_UPLOADS === "1" }); } catch { /* never crash the loop */ }
}, 6 * 60 * 60 * 1000);

// Fold the WAL back into the DB so it can't grow unbounded on a busy fleet.
setInterval(() => checkpoint(), 10 * 60 * 1000);

// Prune proof-of-play beyond the retention window (default 90 days) so the log
// can't grow without bound on a busy signage fleet.
const POP_RETENTION_DAYS = Math.max(1, Number(process.env.GLANCEOS_PLAYLOG_RETENTION_DAYS) || 90);
setInterval(() => {
  try { pruneProofOfPlay(Date.now() - POP_RETENTION_DAYS * 86_400_000); } catch { /* never crash the loop */ }
}, 6 * 60 * 60 * 1000);
