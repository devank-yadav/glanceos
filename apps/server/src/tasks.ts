import type { TasksDataT, TaskItemT } from "@glanceos/schema";
import { db } from "./db";

// Task lists are per-user namespaces: (user_id, list_id) identifies a list.

interface TaskRow {
  id: number;
  list_id: string;
  text: string;
  done: number;
}

function toItem(row: TaskRow): TaskItemT {
  return { id: row.id, text: row.text, done: row.done === 1 };
}

export function listTasks(userId: string, listId: string): TaskItemT[] {
  const rows = db
    .prepare("SELECT * FROM tasks WHERE user_id = ? AND list_id = ? ORDER BY done, created_at")
    .all(userId, listId) as TaskRow[];
  return rows.map(toItem);
}

export function addTask(userId: string, listId: string, text: string): TaskItemT {
  const result = db
    .prepare("INSERT INTO tasks (user_id, list_id, text, done, created_at) VALUES (?, ?, ?, 0, ?)")
    .run(userId, listId, text, Date.now());
  return { id: Number(result.lastInsertRowid), text, done: false };
}

export function updateTask(
  userId: string,
  id: number,
  patch: { text?: string; done?: boolean },
): boolean {
  const result = db
    .prepare(
      "UPDATE tasks SET text = COALESCE(?, text), done = COALESCE(?, done) WHERE id = ? AND user_id = ?",
    )
    .run(patch.text ?? null, patch.done === undefined ? null : patch.done ? 1 : 0, id, userId);
  return result.changes > 0;
}

export function deleteTask(userId: string, id: number): boolean {
  return db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

// The widget shows open items only — a glanceable list, not a task manager.
export function tasksData(props: { listId: string; maxItems: number }, userId: string): TasksDataT {
  return { items: listTasks(userId, props.listId).filter((t) => !t.done).slice(0, props.maxItems) };
}
