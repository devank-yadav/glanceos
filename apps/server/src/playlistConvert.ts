import type { LayoutT, RowT } from "@glanceos/schema";
import { createLayout, getOwnedLayout } from "./layouts";
import { getOwnedPlaylist } from "./playlists";

// G5 Phase 2 — fold a Playlist (rotate a screen through several whole boards on one
// interval) into a single rich multi-page board (the v10 rotation primitive). Each
// source board becomes a page, in order, named after itself; the playlist interval
// becomes the per-board dwell. The pure merge is trivially testable; the device
// repoint + one-time boot backfill are the next phase (this one is non-destructive —
// it creates a new board and leaves the playlist + its source boards intact).

const MAX_PAGES = 9; // schema cap: 1 base page (`rows`) + 8 extra (`pages`)

/** Merge several board documents into one multi-page board. Pure. Caller guarantees
 *  at least one board; extra boards beyond the 9-page cap are dropped (logged upstream). */
export function playlistToMultiPageBoard(boards: LayoutT[], intervalSeconds: number, name: string): LayoutT {
  const used = boards.slice(0, MAX_PAGES);
  const base = used[0]!;
  const extra: RowT[][] = used.slice(1).map((b) => b.rows ?? []);
  const secs = Math.max(3, Math.min(3600, Math.round(intervalSeconds) || 3));
  return {
    ...base, // inherit page 1's theme / look / gap / align
    name,
    rows: base.rows ?? [],
    pages: extra.length ? extra : undefined,
    pageRotateSeconds: secs,
    pageSettings: used.map((b) => ({ name: (b.name ?? "").slice(0, 60) })),
    zones: undefined, // a merged rotation board isn't a multi-zone board
  };
}

/** Build a new multi-page board from a user's playlist and persist it. Returns the new
 *  layout id, or null if the playlist is empty / none of its boards are still readable.
 *  Non-destructive: the playlist and its source boards are untouched. */
export function convertPlaylistToBoard(playlistId: number, userId: string): number | null {
  const pl = getOwnedPlaylist(playlistId, userId);
  if (!pl || pl.items.length === 0) return null;
  const boards: LayoutT[] = [];
  for (const item of pl.items) {
    const rec = getOwnedLayout(item.layoutId, userId);
    if (rec) boards.push(rec.document);
  }
  if (boards.length === 0) return null;
  const doc = playlistToMultiPageBoard(boards, pl.intervalSeconds, `${pl.name} (pages)`);
  return createLayout(doc.name, doc, { userId }).id;
}
