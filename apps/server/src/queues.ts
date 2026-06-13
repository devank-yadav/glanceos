import type { QueueDataT } from "@glanceos/schema";
import { db } from "./db";

// Queues are per-user namespaces: PRIMARY KEY (user_id, id).

export interface QueueRow {
  user_id: string;
  id: string;
  title: string;
  now_serving: number;
  waiting: number;
}

export function getQueue(userId: string, id: string): QueueRow {
  const row = db
    .prepare("SELECT * FROM queues WHERE user_id = ? AND id = ?")
    .get(userId, id) as QueueRow | undefined;
  if (row) return row;
  db.prepare("INSERT INTO queues (user_id, id) VALUES (?, ?)").run(userId, id);
  return getQueue(userId, id);
}

export function advanceQueue(userId: string, id: string, delta: number): QueueRow {
  const q = getQueue(userId, id);
  const next = Math.max(0, q.now_serving + delta);
  const waiting = Math.max(0, q.waiting - Math.max(0, delta));
  db.prepare("UPDATE queues SET now_serving = ?, waiting = ? WHERE user_id = ? AND id = ?").run(
    next,
    waiting,
    userId,
    id,
  );
  return getQueue(userId, id);
}

export function adjustWaiting(userId: string, id: string, delta: number): QueueRow {
  const q = getQueue(userId, id);
  db.prepare("UPDATE queues SET waiting = ? WHERE user_id = ? AND id = ?").run(
    Math.max(0, q.waiting + delta),
    userId,
    id,
  );
  return getQueue(userId, id);
}

export function resetQueue(userId: string, id: string): QueueRow {
  db.prepare("UPDATE queues SET now_serving = 0, waiting = 0 WHERE user_id = ? AND id = ?").run(
    userId,
    id,
  );
  return getQueue(userId, id);
}

export function queueData(props: { queueId: string; title: string }, userId: string): QueueDataT {
  const q = getQueue(userId, props.queueId);
  return { title: props.title || q.title, nowServing: q.now_serving, waiting: q.waiting };
}
