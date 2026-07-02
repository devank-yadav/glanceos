import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-notifarch-"));
const { migrate, db } = await import("./db");
migrate();
const { createUser } = await import("./auth");
const { archiveAll, createIfAbsent, listNotifications, pruneNotifications, searchNotifications, unreadCount } = await import("./notifications");

const u = createUser("Arch", "arch@example.com", "password123")!;

describe("#43 notification archive + search", () => {
  it("Clear-all archives (history survives), empties the bell, zeroes unread", () => {
    createIfAbsent(u.id, null, "offline", "Lobby TV went offline", "k1");
    createIfAbsent(u.id, null, "info", "Screen claimed", "k2");
    expect(listNotifications(u.id).length).toBe(2);
    archiveAll(u.id);
    expect(listNotifications(u.id).length).toBe(0); // bell is clean
    expect(unreadCount(u.id)).toBe(0); // archived rows can't count as unread
    expect(searchNotifications(u.id, { all: true }).length).toBe(2); // history intact
    expect(searchNotifications(u.id, { all: true })[0]!.archived).toBe(true);
  });

  it("dedupe holds across the archive — a same-key repeat stays quiet after a clear", () => {
    expect(createIfAbsent(u.id, null, "offline", "Lobby TV went offline", "k1")).toBe(false);
    expect(listNotifications(u.id).length).toBe(0); // nothing resurfaced
  });

  it("search matches message substrings; LIKE wildcards in the query are literal", () => {
    createIfAbsent(u.id, null, "conn", "Notion connection needs auth", "k3");
    expect(searchNotifications(u.id, { all: true, q: "lobby tv" }).length).toBe(1);
    expect(searchNotifications(u.id, { all: true, q: "needs auth" }).length).toBe(1);
    expect(searchNotifications(u.id, { all: true, q: "%" }).length).toBe(0); // literal %, matches nothing
    expect(searchNotifications(u.id, { q: "lobby" }).length).toBe(0); // default scope = active only (archived k1 hidden)
  });

  it("prune drops only OLD archived rows; active and fresh-archived stay", () => {
    db.prepare("UPDATE notifications SET archived_at = ? WHERE dedupe_key = 'k1'").run(Date.now() - 100 * 86_400_000);
    pruneNotifications(Date.now() - 90 * 86_400_000);
    const all = searchNotifications(u.id, { all: true });
    expect(all.some((n) => n.message.includes("Lobby"))).toBe(false); // 100d-old archived → gone
    expect(all.some((n) => n.message.includes("claimed"))).toBe(true); // freshly archived stays
    expect(all.some((n) => n.message.includes("Notion"))).toBe(true); // active stays
  });
});
