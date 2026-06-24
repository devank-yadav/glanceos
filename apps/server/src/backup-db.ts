import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { dataDir, db } from "./db";

// Online, consistent SQLite snapshots so a hosted/operated GlanceOS has a real
// recovery story (volume corruption / accidental deletion = restore, not data
// loss). Uses better-sqlite3's page-copy backup — safe while the server runs.
// CLI: `pnpm --filter @glanceos/server backup`. Optional scheduled snapshots are
// wired in index.ts behind GLANCEOS_BACKUP_INTERVAL_HOURS.

/** Where snapshots are written (override with GLANCEOS_BACKUP_DIR). */
export const backupDir = process.env.GLANCEOS_BACKUP_DIR ?? join(dataDir, "backups");

// Filesystem-safe timestamp: 2026-06-24_05-41-09
const stamp = (d: Date): string => d.toISOString().replace(/:/g, "-").replace(/\..+$/, "").replace("T", "_");

/** Write an online snapshot of the live DB. Returns the snapshot path. */
export async function snapshotDatabase(destDir: string = backupDir, now: Date = new Date()): Promise<string> {
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, `glanceos-${stamp(now)}.db`);
  await db.backup(dest);
  return dest;
}

/** Keep only the newest `keep` snapshots in `destDir`; delete the older ones.
 *  Returns how many were removed. Best-effort (never throws). */
export function pruneSnapshots(keep = 14, destDir: string = backupDir): number {
  let files: string[];
  try { files = readdirSync(destDir).filter((f) => f.startsWith("glanceos-") && f.endsWith(".db")); }
  catch { return 0; }
  if (files.length <= keep) return 0;
  const byNewest = files
    .map((f) => ({ f, t: statSync(join(destDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  let removed = 0;
  for (const { f } of byNewest.slice(keep)) {
    try { rmSync(join(destDir, f), { force: true }); removed++; } catch { /* ignore */ }
  }
  return removed;
}

// CLI entry: write one snapshot, prune to the default window, report the path.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  snapshotDatabase()
    .then((p) => {
      const removed = pruneSnapshots();
      console.log(`[backup] wrote ${p}${removed ? ` (pruned ${removed} old)` : ""}`);
      process.exit(0);
    })
    .catch((e) => { console.error("[backup] failed:", e); process.exit(1); });
}
