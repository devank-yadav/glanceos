import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LayoutT } from "@glanceos/schema";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-journal-"));
const { migrate } = await import("./db");
migrate();
const { setJournal, getJournal, recentJournal, promptForDay } = await import("./journal");
const { resolveWidgetData } = await import("./widgets");
const { createUser } = await import("./auth");

// #153 — a calm end-of-day prompt and a place to answer it (one entry per user per day).
describe("#153 reflection journal", () => {
  it("round-trips an entry; empty text clears it", () => {
    setJournal("ju1", "2026-07-01", "went for a walk", 1000);
    expect(getJournal("ju1", "2026-07-01")?.text).toBe("went for a walk");
    setJournal("ju1", "2026-07-01", "   ", 2000); // blank → delete
    expect(getJournal("ju1", "2026-07-01")).toBeNull();
  });

  it("recent entries come back newest day first", () => {
    setJournal("ju2", "2026-06-29", "a", 1);
    setJournal("ju2", "2026-07-01", "c", 1);
    setJournal("ju2", "2026-06-30", "b", 1);
    expect(recentJournal("ju2").map((e) => e.day)).toEqual(["2026-07-01", "2026-06-30", "2026-06-29"]);
  });

  it("the prompt is deterministic per day and from the fixed set", () => {
    expect(promptForDay("2026-07-01")).toBe(promptForDay("2026-07-01"));
    expect(typeof promptForDay("2026-07-01")).toBe("string");
    expect(promptForDay("2026-07-01").length).toBeGreaterThan(0);
  });

  it("a journal block resolves to the latest entry + its prompt", async () => {
    const user = createUser("Journal", "journal@example.com", "password123")!;
    setJournal(user.id, "2026-07-01", "grateful for coffee", 5);
    const board = ({ schemaVersion: 3, name: "x", theme: { mode: "light", fontScale: "m" }, gap: 2, align: "top",
      rows: [{ id: "r", h: 5, blocks: [{ id: "jn", type: "journal", width: 1, props: { label: "Reflection" } }] }] }) as unknown as LayoutT;
    const data = await resolveWidgetData(board, user.id);
    expect(data["jn"]).toMatchObject({ entry: "grateful for coffee", prompt: promptForDay("2026-07-01") });
  });
});
