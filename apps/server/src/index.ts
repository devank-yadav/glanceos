import { serve } from "@hono/node-server";
import { buildApp } from "./api";
import { validateConfig } from "./config";
import { snapshotDatabase, pruneSnapshots } from "./backup-db";
import { checkpoint, migrate } from "./db";
import { emailConfigured } from "./email";
import { runLifecycleSweep } from "./lifecycle";
import { runAlertChecks } from "./notifications";
import { runAutomationTick } from "./automation/engine";
import { pruneAutomationRuns } from "./automations";
import { pruneProofOfPlay } from "./playlog";
import { gcRateLimits } from "./ratelimit";
import { undecryptableSecretCount } from "./rotate";
import { seedTemplates } from "./seed";
import { pushAllConnected, pushScheduledDevices } from "./state";
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

if (!emailConfigured()) console.warn("[email] no mail backend configured (RESEND_API_KEY or SMTP_HOST) — verification, reset, and invite emails are no-ops");

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: buildApp().fetch, port }, (info) => {
  console.log(`[glanceos] server on http://localhost:${info.port}`);
});

// Weather and calendars drift on their own — refresh connected screens periodically.
setInterval(() => {
  pushAllConnected(2 * 60 * 1000).catch(() => {}); // spread over 2 min
}, 5 * 60 * 1000);

// Flip scheduled screens at their window boundaries (minute granularity is
// enough). Staggered across ~30s so a big fleet doesn't all recompose at once.
setInterval(() => {
  pushScheduledDevices(30 * 1000).catch(() => {});
}, 60 * 1000);

// Flag offline / low-battery screens as in-app notifications.
setInterval(() => {
  try { runAlertChecks(); } catch { /* never let the sweep crash the loop */ }
}, 60 * 1000);

// Lifecycle email nudges (day-3 activation, weekly digest). Slow timer; no-op without
// a mail backend. The 6h cadence comfortably covers the 48h day-3 window.
setInterval(() => { runLifecycleSweep().catch(() => {}); }, 6 * 60 * 60 * 1000);

// Run automations: data-threshold/"changed", time-of-day, and screen on/offline edges.
setInterval(() => {
  runAutomationTick().catch(() => {}); // never let a bad automation crash the loop
}, 60 * 1000);

// Prune the automation run-log beyond its retention window (default 30 days).
const AUTO_RUN_RETENTION_DAYS = Math.max(1, Number(process.env.GLANCEOS_AUTOMATION_LOG_RETENTION_DAYS) || 30);
setInterval(() => {
  try { pruneAutomationRuns(Date.now() - AUTO_RUN_RETENTION_DAYS * 86_400_000); } catch { /* never crash the loop */ }
}, 6 * 60 * 60 * 1000);

// Drop expired rate-limit windows so the map stays bounded.
setInterval(() => gcRateLimits(), 5 * 60 * 1000);

// Reclaim upload disk: orphan files always; unreferenced rows only when opted in.
setInterval(() => {
  try { gcUploads({ reclaimUnreferenced: process.env.GLANCEOS_GC_UNREFERENCED_UPLOADS === "1" }); } catch { /* never crash the loop */ }
}, 6 * 60 * 60 * 1000);

// Fold the WAL back into the DB so it can't grow unbounded on a busy fleet.
setInterval(() => checkpoint(), 10 * 60 * 1000);

// Optional scheduled DB snapshots (online better-sqlite3 backup) for operated/
// hosted deployments. Off by default; set GLANCEOS_BACKUP_INTERVAL_HOURS to
// enable. Keeps the newest GLANCEOS_BACKUP_KEEP (default 14) snapshots.
const BACKUP_HOURS = Number(process.env.GLANCEOS_BACKUP_INTERVAL_HOURS) || 0;
if (BACKUP_HOURS > 0) {
  const keep = Math.max(1, Number(process.env.GLANCEOS_BACKUP_KEEP) || 14);
  setInterval(() => {
    snapshotDatabase()
      .then((p) => { pruneSnapshots(keep); console.log(`[backup] snapshot ${p}`); })
      .catch((e) => console.error("[backup] scheduled snapshot failed:", e));
  }, BACKUP_HOURS * 60 * 60 * 1000);
}

// Prune proof-of-play beyond the retention window (default 90 days) so the log
// can't grow without bound on a busy signage fleet.
const POP_RETENTION_DAYS = Math.max(1, Number(process.env.GLANCEOS_PLAYLOG_RETENTION_DAYS) || 90);
setInterval(() => {
  try { pruneProofOfPlay(Date.now() - POP_RETENTION_DAYS * 86_400_000); } catch { /* never crash the loop */ }
}, 6 * 60 * 60 * 1000);
