import { serve } from "@hono/node-server";
import { buildApp } from "./api";
import { validateConfig } from "./config";
import { migrate } from "./db";
import { runAlertChecks } from "./notifications";
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

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: buildApp().fetch, port }, (info) => {
  console.log(`[glanceos] server on http://localhost:${info.port}`);
});

// Weather and calendars drift on their own — refresh connected screens periodically.
setInterval(() => {
  pushAllConnected().catch(() => {});
}, 5 * 60 * 1000);

// Advance rotating (playlist) screens to their current item.
setInterval(() => {
  pushRotatingDevices().catch(() => {});
}, 10 * 1000);

// Flip scheduled screens at their window boundaries (minute granularity is enough).
setInterval(() => {
  pushScheduledDevices().catch(() => {});
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
