import { randomUUID } from "node:crypto";
import type { ActionT, AutomationT, ConditionT, TriggerT } from "@glanceos/schema";
import { db } from "./db";

// Storage for automations + their run-log. The engine (automation/engine.ts) reads
// these; the API validates input against the @glanceos/schema Automation contract
// before it ever reaches here.

interface AutomationRow {
  id: string; user_id: string; name: string; enabled: number;
  trigger: string; conditions: string | null; actions: string;
  layout_id: number | null;
  created_at: number; last_run: number | null; run_count: number;
}
export interface AutomationRecord {
  id: string; name: string; enabled: boolean;
  trigger: TriggerT; conditions: ConditionT | null; actions: ActionT[];
  layoutId: number | null; // board this rule belongs to (reads/writes its objects); null = global
  createdAt: number; lastRun: number | null; runCount: number;
}

const hydrate = (r: AutomationRow): AutomationRecord => ({
  id: r.id, name: r.name, enabled: !!r.enabled,
  trigger: JSON.parse(r.trigger) as TriggerT,
  conditions: r.conditions ? (JSON.parse(r.conditions) as ConditionT) : null,
  actions: JSON.parse(r.actions) as ActionT[],
  layoutId: r.layout_id,
  createdAt: r.created_at, lastRun: r.last_run, runCount: r.run_count,
});

export function listAutomations(userId: string): AutomationRecord[] {
  return (db.prepare("SELECT * FROM automations WHERE user_id = ? ORDER BY created_at DESC").all(userId) as AutomationRow[]).map(hydrate);
}
export function getAutomation(id: string, userId: string): AutomationRecord | null {
  const r = db.prepare("SELECT * FROM automations WHERE id = ? AND user_id = ?").get(id, userId) as AutomationRow | undefined;
  return r ? hydrate(r) : null;
}
export function countAutomations(userId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM automations WHERE user_id = ?").get(userId) as { n: number }).n;
}

/** All enabled automations for a user whose trigger matches `kind`. */
export function enabledByTrigger(userId: string, kind: TriggerT["kind"]): AutomationRecord[] {
  return listAutomations(userId).filter((a) => a.enabled && a.trigger.kind === kind);
}

export const MAX_AUTOMATIONS_PER_USER = 200; // bounds the per-minute tick cost

export function createAutomation(userId: string, a: AutomationT, layoutId: number | null = null): AutomationRecord {
  const id = randomUUID();
  db.prepare("INSERT INTO automations (id, user_id, name, enabled, trigger, conditions, actions, layout_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, userId, a.name, a.enabled ? 1 : 0, JSON.stringify(a.trigger), a.conditions ? JSON.stringify(a.conditions) : null, JSON.stringify(a.actions), layoutId, Date.now());
  return getAutomation(id, userId)!;
}

export function updateAutomation(id: string, userId: string, a: AutomationT, layoutId: number | null = null): AutomationRecord | null {
  const existing = db.prepare("SELECT 1 FROM automations WHERE id = ? AND user_id = ?").get(id, userId);
  if (!existing) return null;
  db.prepare("UPDATE automations SET name = ?, enabled = ?, trigger = ?, conditions = ?, actions = ?, layout_id = ? WHERE id = ?")
    .run(a.name, a.enabled ? 1 : 0, JSON.stringify(a.trigger), a.conditions ? JSON.stringify(a.conditions) : null, JSON.stringify(a.actions), layoutId, id);
  return getAutomation(id, userId);
}

/** Automations belonging to a specific board (for the Studio Automations tab). */
export function automationsForLayout(userId: string, layoutId: number): AutomationRecord[] {
  return listAutomations(userId).filter((a) => a.layoutId === layoutId);
}

export function setAutomationEnabled(id: string, userId: string, enabled: boolean): boolean {
  return db.prepare("UPDATE automations SET enabled = ? WHERE id = ? AND user_id = ?").run(enabled ? 1 : 0, id, userId).changes > 0;
}

export function deleteAutomation(id: string, userId: string): boolean {
  return db.prepare("DELETE FROM automations WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

export function recordRun(automationId: string, userId: string, trigger: string, matched: boolean, actionsRun: number, error: string | null, now = Date.now()): void {
  db.prepare("INSERT INTO automation_runs (automation_id, user_id, trigger, matched, actions_run, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(automationId, userId, trigger, matched ? 1 : 0, actionsRun, error, now);
  if (matched) db.prepare("UPDATE automations SET last_run = ?, run_count = run_count + 1 WHERE id = ?").run(now, automationId);
}

export interface RunLog { id: number; trigger: string; matched: boolean; actionsRun: number; error: string | null; createdAt: number }
export function listRuns(automationId: string, userId: string, limit = 20): RunLog[] {
  const rows = db.prepare(
    "SELECT r.id, r.trigger, r.matched, r.actions_run, r.error, r.created_at FROM automation_runs r " +
      "JOIN automations a ON a.id = r.automation_id WHERE r.automation_id = ? AND a.user_id = ? ORDER BY r.created_at DESC LIMIT ?",
  ).all(automationId, userId, limit) as Array<{ id: number; trigger: string; matched: number; actions_run: number; error: string | null; created_at: number }>;
  return rows.map((r) => ({ id: r.id, trigger: r.trigger, matched: !!r.matched, actionsRun: r.actions_run, error: r.error, createdAt: r.created_at }));
}

/** Prune run-log rows older than `before` (called on the GC timer). */
export function pruneAutomationRuns(before: number): void {
  db.prepare("DELETE FROM automation_runs WHERE created_at < ?").run(before);
}

export function allUserIds(): string[] {
  return (db.prepare("SELECT id FROM users").all() as Array<{ id: string }>).map((r) => r.id);
}
