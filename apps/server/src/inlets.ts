import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { open, seal } from "./secrets";
import { addTask } from "./tasks";
import { advanceQueue } from "./queues";
import { setCustomData } from "./customdata";
import { pushUserDevices } from "./state";
import { fireAutomations } from "./automation/engine";

// Inbound webhook inlets. POST /api/hooks/:secret (no session/CSRF — the secret
// is the capability). An optional HMAC key requires a signed body. A fired inlet
// routes its JSON payload to a sink. The HMAC key (if any) is shown ONCE at
// creation; only its sealed form is stored. resolveInlet/verify/route are pure
// enough to unit-test offline.

export const SINK_KINDS = ["task", "queue", "data", "none"] as const;
export type SinkKind = (typeof SINK_KINDS)[number];
export const isSinkKind = (s: string): s is SinkKind => (SINK_KINDS as readonly string[]).includes(s);

interface InletRow {
  id: string; user_id: string; name: string; secret: string; hmac_key: Buffer | null;
  sink_kind: SinkKind; sink_target: string; enabled: number; created_at: number; last_fired: number | null;
}
export interface InletSummary {
  id: string; name: string; secret: string; sinkKind: SinkKind; sinkTarget: string;
  enabled: boolean; signed: boolean; createdAt: number; lastFired: number | null;
}

const toSummary = (r: InletRow): InletSummary => ({
  id: r.id, name: r.name, secret: r.secret, sinkKind: r.sink_kind, sinkTarget: r.sink_target,
  enabled: !!r.enabled, signed: r.hmac_key != null, createdAt: r.created_at, lastFired: r.last_fired,
});

export function listInlets(userId: string): InletSummary[] {
  return (db.prepare("SELECT * FROM inlets WHERE user_id = ? ORDER BY created_at DESC").all(userId) as InletRow[]).map(toSummary);
}

export interface CreateInletInput { name: string; sinkKind: SinkKind; sinkTarget?: string; requireSignature?: boolean }

/** Create an inlet. If requireSignature, generates a signing key and returns it
 *  ONCE (never recoverable) alongside the summary. */
export function createInlet(userId: string, input: CreateInletInput, now = Date.now()): { inlet: InletSummary; signingKey?: string } {
  const id = randomUUID();
  const secret = randomBytes(24).toString("base64url");
  const signingKey = input.requireSignature ? randomBytes(32).toString("hex") : undefined;
  db.prepare(
    "INSERT INTO inlets (id, user_id, name, secret, hmac_key, sink_kind, sink_target, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)",
  ).run(id, userId, (input.name.trim() || "Inlet").slice(0, 80), secret, signingKey ? seal(signingKey) : null, input.sinkKind, (input.sinkTarget ?? "").slice(0, 100), now);
  return { inlet: toSummary(db.prepare("SELECT * FROM inlets WHERE id = ?").get(id) as InletRow), signingKey };
}

export function updateInlet(id: string, userId: string, patch: Partial<{ name: string; sinkKind: SinkKind; sinkTarget: string; enabled: boolean }>): InletSummary | null {
  const row = db.prepare("SELECT * FROM inlets WHERE id = ? AND user_id = ?").get(id, userId) as InletRow | undefined;
  if (!row) return null;
  db.prepare("UPDATE inlets SET name = ?, sink_kind = ?, sink_target = ?, enabled = ? WHERE id = ?").run(
    (patch.name ?? row.name).slice(0, 80),
    patch.sinkKind ?? row.sink_kind,
    (patch.sinkTarget ?? row.sink_target).slice(0, 100),
    patch.enabled === undefined ? row.enabled : patch.enabled ? 1 : 0,
    id,
  );
  return toSummary(db.prepare("SELECT * FROM inlets WHERE id = ?").get(id) as InletRow);
}

export function deleteInlet(id: string, userId: string): boolean {
  return db.prepare("DELETE FROM inlets WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

/** Look up an inlet by its URL secret (any enabled state — caller checks). */
export function resolveInlet(secret: string): InletRow | null {
  return (db.prepare("SELECT * FROM inlets WHERE secret = ?").get(secret) as InletRow | undefined) ?? null;
}

/** Verify a request signature. Inlets with no HMAC key accept any body (the URL
 *  secret is the capability). Signed inlets require sha256 HMAC of the RAW body. */
export function verifyInletSignature(row: InletRow, rawBody: string, header: string | undefined): boolean {
  if (row.hmac_key == null) return true;
  const key = open(row.hmac_key);
  if (!key) return false;
  const expected = createHmac("sha256", key).update(rawBody, "utf8").digest("hex");
  const got = (header ?? "").replace(/^sha256=/, "").trim();
  if (got.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
  } catch { return false; }
}

const asText = (payload: Record<string, unknown>): string => {
  const t = payload.text ?? payload.title ?? payload.message ?? payload.value;
  return (typeof t === "string" ? t : JSON.stringify(payload)).slice(0, 500);
};

/** Route a fired inlet's payload to its sink, mark it fired, and refresh screens.
 *  `fireAutos` is set false when the call originated from an automation's own
 *  webhook action (marker header), preventing an HTTP self-trigger loop. */
export async function routeInlet(row: InletRow, payload: Record<string, unknown>, opts: { fireAutos?: boolean } = {}): Promise<{ routed: SinkKind }> {
  const now = Date.now();
  const uid = row.user_id;
  switch (row.sink_kind) {
    case "task":
      addTask(uid, row.sink_target || "default", asText(payload));
      break;
    case "queue": {
      const delta = Number(payload.delta);
      advanceQueue(uid, row.sink_target || "default", Number.isFinite(delta) ? delta : 1);
      break;
    }
    case "data": {
      const key = row.sink_target || (typeof payload.key === "string" ? payload.key : "");
      if (key) setCustomData(uid, key, "value" in payload ? payload.value : payload);
      break;
    }
    case "none":
      break;
  }
  db.prepare("UPDATE inlets SET last_fired = ? WHERE id = ?").run(now, row.id);
  if (opts.fireAutos !== false) await fireAutomations(uid, "webhook", { webhook: payload }); // reactive: a hook can trigger automations
  await pushUserDevices(uid);
  return { routed: row.sink_kind };
}
