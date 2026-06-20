import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir, db } from "./db";

// Self-hosted image uploads: bytes on disk under the data dir, a row for
// ownership/metadata. The id is server-generated (no client filename reaches the
// path → no traversal), and only an allowlisted image mime is accepted.

const UPLOAD_DIR = join(dataDir, "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB per file
// Per-user total quota across all uploads (env-tunable; default 50 MB → no
// migration). An explicit 0 means "block all uploads".
const QUOTA_MB = Number(process.env.GLANCEOS_UPLOAD_QUOTA_MB);
export const UPLOAD_QUOTA_BYTES = (Number.isFinite(QUOTA_MB) ? QUOTA_MB : 50) * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
};
export function isAllowedMime(mime: string): boolean {
  return mime in EXT;
}

export interface Upload { id: string; url: string }

/** Persist an uploaded image; returns its public /uploads/<id>.<ext> URL. */
export function saveUpload(userId: string, bytes: Buffer, mime: string, filename = ""): Upload {
  const ext = EXT[mime]!;
  const id = randomUUID();
  const name = `${id}.${ext}`;
  writeFileSync(join(UPLOAD_DIR, name), bytes); // id is a UUID → safe filename, no traversal
  db.prepare("INSERT INTO uploads (id, user_id, filename, mime, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, userId, filename.slice(0, 200), mime, bytes.length, Date.now());
  return { id, url: `/uploads/${name}` };
}

/** Total bytes a user is currently storing across all their uploads. */
export function userUsage(userId: string): number {
  return (db.prepare("SELECT COALESCE(SUM(bytes), 0) AS n FROM uploads WHERE user_id = ?").get(userId) as { n: number }).n;
}

/** Garbage-collect uploads. Pass 1 (always safe): delete on-disk files with no
 *  DB row. Pass 2 (opt-in): reclaim rows whose /uploads/<name> appears in no
 *  layout document, deleting the row + file. Returns what it removed. */
export function gcUploads(opts: { reclaimUnreferenced?: boolean } = {}): { orphanFiles: number; unreferenced: number } {
  let orphanFiles = 0, unreferenced = 0;
  const rows = db.prepare("SELECT id, mime FROM uploads").all() as { id: string; mime: string }[];
  const nameOf = (r: { id: string; mime: string }) => `${r.id}.${EXT[r.mime] ?? "bin"}`;
  const known = new Set(rows.map(nameOf));
  for (const f of readdirSync(UPLOAD_DIR)) {
    if (!known.has(f)) { try { unlinkSync(join(UPLOAD_DIR, f)); orphanFiles++; } catch { /* ignore */ } }
  }
  if (opts.reclaimUnreferenced) {
    const docs = (db.prepare("SELECT document FROM layouts").all() as { document: string }[]).map((d) => d.document).join("\n");
    for (const r of rows) {
      const name = nameOf(r);
      if (!docs.includes(`/uploads/${name}`)) {
        db.prepare("DELETE FROM uploads WHERE id = ?").run(r.id);
        try { unlinkSync(join(UPLOAD_DIR, name)); } catch { /* ignore */ }
        unreferenced++;
      }
    }
  }
  return { orphanFiles, unreferenced };
}
