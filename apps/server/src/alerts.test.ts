import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-alerts-"));
process.env.GLANCEOS_RATE_LIMIT = "off";

const { migrate } = await import("./db");
migrate();
const { createUser } = await import("./auth");
const { ackAlert, claimDueEscalations, createAlertAck, openAlerts, pruneAlertAcks } = await import("./alerts");

const MIN = 60_000;

// #13 — alerts that wait for a human. Acking is a phone/config/API action; the wall
// only ever displays. Escalation re-raises an ignored alert exactly once.
describe("#13 alert acknowledgement + escalation", () => {
  it("an alert awaiting ack is open until acknowledged, then gone", () => {
    const u = createUser("Ack", "ack@example.com", "password123")!;
    const a = createAlertAck(u.id, { title: "Server room hot", body: "31°C", severity: "warn" });
    expect(openAlerts(u.id).map((x) => x.title)).toEqual(["Server room hot"]);
    expect(ackAlert(a.id, u.id)).toBe(true);
    expect(openAlerts(u.id)).toEqual([]);
    expect(ackAlert(a.id, u.id)).toBe(false); // acking twice is a no-op, not an error
  });

  it("another account can neither see nor acknowledge it", () => {
    const mine = createUser("Ack2", "ack2@example.com", "password123")!;
    const other = createUser("Ack3", "ack3@example.com", "password123")!;
    const a = createAlertAck(mine.id, { title: "Private alarm", severity: "critical" });
    expect(openAlerts(other.id)).toEqual([]);
    expect(ackAlert(a.id, other.id)).toBe(false);
    expect(openAlerts(mine.id).length).toBe(1);
  });

  it("escalates once when unacked past the deadline — never twice", () => {
    const u = createUser("Esc", "esc@example.com", "password123")!;
    const now = Date.now();
    createAlertAck(u.id, { title: "Door left open", severity: "warn", escalateMinutes: 15 }, now);
    expect(claimDueEscalations(now + 5 * MIN)).toEqual([]); // not due yet
    const due = claimDueEscalations(now + 16 * MIN);
    expect(due.map((d) => d.ack.title)).toEqual(["Door left open"]);
    expect(claimDueEscalations(now + 30 * MIN)).toEqual([]); // claimed → never re-raised
    expect(openAlerts(u.id).length).toBe(1); // still waiting on a human
  });

  it("acknowledging in time cancels the escalation entirely", () => {
    const u = createUser("Esc2", "esc2@example.com", "password123")!;
    const now = Date.now();
    const a = createAlertAck(u.id, { title: "Pump alarm", severity: "critical", escalateMinutes: 10 }, now);
    ackAlert(a.id, u.id, now + 2 * MIN);
    expect(claimDueEscalations(now + 20 * MIN)).toEqual([]);
  });

  it("an ack-only alert (no escalation window) never escalates", () => {
    const u = createUser("Esc3", "esc3@example.com", "password123")!;
    createAlertAck(u.id, { title: "FYI", severity: "info" });
    expect(claimDueEscalations(Date.now() + 999 * MIN)).toEqual([]);
  });

  it("prune drops resolved history but never an alert still waiting", () => {
    const u = createUser("Prune", "prunealert@example.com", "password123")!;
    const old = Date.now() - 60 * 86_400_000;
    const done = createAlertAck(u.id, { title: "Old and acked", severity: "info" }, old);
    ackAlert(done.id, u.id, old);
    createAlertAck(u.id, { title: "Old but still open", severity: "warn" }, old);
    pruneAlertAcks(Date.now() - 30 * 86_400_000);
    expect(openAlerts(u.id).map((x) => x.title)).toEqual(["Old but still open"]);
  });
});
