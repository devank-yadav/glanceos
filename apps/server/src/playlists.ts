import { db } from "./db";

// A playlist makes a screen rotate through several setups on a schedule.
// The "current" item is chosen deterministically from the clock, so every
// renderer (SSE browsers and polled e-ink devices) agrees without coordination.

export interface PlaylistItem {
  layoutId: number;
  name: string;
}
export interface PlaylistRecord {
  id: number;
  name: string;
  intervalSeconds: number;
  items: PlaylistItem[];
}

interface PlaylistRow {
  id: number;
  user_id: string;
  name: string;
  interval_seconds: number;
}

function itemsOf(playlistId: number): PlaylistItem[] {
  return db
    .prepare(
      `SELECT pi.layout_id AS layoutId, l.name AS name
       FROM playlist_items pi JOIN layouts l ON l.id = pi.layout_id
       WHERE pi.playlist_id = ? ORDER BY pi.position`,
    )
    .all(playlistId) as PlaylistItem[];
}

function toRecord(row: PlaylistRow): PlaylistRecord {
  return { id: row.id, name: row.name, intervalSeconds: row.interval_seconds, items: itemsOf(row.id) };
}

export function getOwnedPlaylist(id: number, userId: string): PlaylistRecord | undefined {
  const row = db.prepare("SELECT * FROM playlists WHERE id = ? AND user_id = ?").get(id, userId) as PlaylistRow | undefined;
  return row ? toRecord(row) : undefined;
}

export function listPlaylists(userId: string): PlaylistRecord[] {
  const rows = db.prepare("SELECT * FROM playlists WHERE user_id = ? ORDER BY id").all(userId) as PlaylistRow[];
  return rows.map(toRecord);
}

export function createPlaylist(userId: string, name: string, intervalSeconds: number): PlaylistRecord {
  const result = db
    .prepare("INSERT INTO playlists (user_id, name, interval_seconds, created_at) VALUES (?, ?, ?, ?)")
    .run(userId, name.trim() || "Playlist", Math.max(5, Math.round(intervalSeconds)), Date.now());
  return getOwnedPlaylist(Number(result.lastInsertRowid), userId)!;
}

export function updatePlaylist(
  id: number,
  userId: string,
  patch: { name?: string; intervalSeconds?: number; layoutIds?: number[] },
): PlaylistRecord | undefined {
  const existing = getOwnedPlaylist(id, userId);
  if (!existing) return undefined;
  if (patch.name !== undefined || patch.intervalSeconds !== undefined) {
    db.prepare("UPDATE playlists SET name = COALESCE(?, name), interval_seconds = COALESCE(?, interval_seconds) WHERE id = ?").run(
      patch.name?.trim() || null,
      patch.intervalSeconds !== undefined ? Math.max(5, Math.round(patch.intervalSeconds)) : null,
      id,
    );
  }
  if (patch.layoutIds) {
    // only the user's own layouts may be added
    const owned = new Set(
      (db.prepare("SELECT id FROM layouts WHERE user_id = ?").all(userId) as Array<{ id: number }>).map((r) => r.id),
    );
    db.prepare("DELETE FROM playlist_items WHERE playlist_id = ?").run(id);
    const ins = db.prepare("INSERT INTO playlist_items (playlist_id, position, layout_id) VALUES (?, ?, ?)");
    patch.layoutIds.filter((lid) => owned.has(lid)).forEach((lid, pos) => ins.run(id, pos, lid));
  }
  return getOwnedPlaylist(id, userId);
}

export function deletePlaylist(id: number, userId: string): boolean {
  return db.prepare("DELETE FROM playlists WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

/** The layout id a playlist shows right now (deterministic from the clock). */
export function currentPlaylistLayout(playlistId: number, now: number): number | null {
  const items = itemsOf(playlistId);
  if (items.length === 0) return null;
  const row = db.prepare("SELECT interval_seconds FROM playlists WHERE id = ?").get(playlistId) as
    | { interval_seconds: number }
    | undefined;
  const interval = Math.max(5, row?.interval_seconds ?? 300);
  const index = Math.floor(now / 1000 / interval) % items.length;
  return items[index]!.layoutId;
}
