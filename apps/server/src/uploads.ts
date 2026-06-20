import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir, db } from "./db";

// Self-hosted image uploads: bytes on disk under the data dir, a row for
// ownership/metadata. The id is server-generated (no client filename reaches the
// path → no traversal), and only an allowlisted image mime is accepted.

const UPLOAD_DIR = join(dataDir, "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB
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
