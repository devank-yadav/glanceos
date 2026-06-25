import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LayoutT } from "@glanceos/schema";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-plc-"));
process.env.GLANCEOS_RATE_LIMIT = "off";

const { migrate } = await import("./db");
const { createUser } = await import("./auth");
const { createLayout, getOwnedLayout } = await import("./layouts");
const { createPlaylist, updatePlaylist } = await import("./playlists");
const { playlistToMultiPageBoard, convertPlaylistToBoard } = await import("./playlistConvert");

migrate();
const user = createUser("PL", "pl@example.com", "password123")!;

const board = (name: string, marker: string): LayoutT =>
  ({ schemaVersion: 3, name, theme: { mode: "light", fontScale: "m" }, gap: 2, align: "top", rows: [{ id: "r", h: 6, blocks: [{ id: marker, type: "divider", width: 1, props: {} }] }] }) as unknown as LayoutT;
const firstBlockId = (rows: LayoutT["rows"]): string => (rows[0]?.blocks[0]?.id ?? "");

describe("playlistToMultiPageBoard — pure board merge", () => {
  it("page 0 = first board, the rest become pages, each page named, dwell set", () => {
    const doc = playlistToMultiPageBoard([board("Agenda", "a"), board("Menu", "b"), board("Clock", "c")], 20, "My Rotation");
    expect(doc.name).toBe("My Rotation");
    expect(firstBlockId(doc.rows)).toBe("a");
    expect(doc.pages).toHaveLength(2);
    expect(firstBlockId(doc.pages![0]!)).toBe("b");
    expect(firstBlockId(doc.pages![1]!)).toBe("c");
    expect(doc.pageRotateSeconds).toBe(20);
    expect(doc.pageSettings?.map((p) => p.name)).toEqual(["Agenda", "Menu", "Clock"]);
  });
  it("a single-board playlist makes a one-page board (no extra pages)", () => {
    const doc = playlistToMultiPageBoard([board("Solo", "s")], 30, "Solo");
    expect(doc.pages).toBeUndefined();
    expect(doc.pageSettings).toHaveLength(1);
  });
  it("clamps the interval (min 3s) and caps at 9 pages", () => {
    expect(playlistToMultiPageBoard([board("x", "x"), board("y", "y")], 1, "x").pageRotateSeconds).toBe(3);
    const many = Array.from({ length: 12 }, (_, i) => board("b" + i, "b" + i));
    const doc = playlistToMultiPageBoard(many, 10, "Many");
    expect((doc.pages ?? []).length).toBe(8); // 1 base + 8 = the 9-page cap
    expect(doc.pageSettings).toHaveLength(9);
  });
});

describe("convertPlaylistToBoard — persisted, non-destructive", () => {
  it("builds a stored multi-page board from a playlist's boards", () => {
    const l1 = createLayout("Board A", board("Board A", "ba"), { userId: user.id }).id;
    const l2 = createLayout("Board B", board("Board B", "bb"), { userId: user.id }).id;
    const pl = createPlaylist(user.id, "Lobby loop", 15);
    updatePlaylist(pl.id, user.id, { layoutIds: [l1, l2] });
    const newId = convertPlaylistToBoard(pl.id, user.id);
    expect(newId).not.toBeNull();
    const rec = getOwnedLayout(newId!, user.id)!;
    expect(rec.document.name).toBe("Lobby loop (pages)");
    expect(rec.document.pages).toHaveLength(1);
    expect(rec.document.pageRotateSeconds).toBe(15);
    expect(rec.document.pageSettings).toHaveLength(2);
    // non-destructive: the source boards still exist on their own
    expect(getOwnedLayout(l1, user.id)).toBeTruthy();
  });
  it("returns null for an empty playlist", () => {
    const empty = createPlaylist(user.id, "Empty", 10);
    expect(convertPlaylistToBoard(empty.id, user.id)).toBeNull();
  });
});
