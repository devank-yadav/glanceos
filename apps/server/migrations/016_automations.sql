-- v3.0 (reactive): automations. A trigger (webhook / device online↔offline /
-- minute tick / time-of-day) plus an optional condition tree decides whether to
-- run a list of actions. Trigger/conditions/actions are JSON validated by the
-- @glanceos/schema contract. automation_runs is an audit log, pruned on a timer.

CREATE TABLE automations (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  trigger     TEXT NOT NULL,            -- JSON TriggerT
  conditions  TEXT,                     -- JSON ConditionT | null
  actions     TEXT NOT NULL,            -- JSON ActionT[]
  created_at  INTEGER NOT NULL,
  last_run    INTEGER,
  run_count   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX automations_by_user ON automations(user_id);

CREATE TABLE automation_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  trigger       TEXT NOT NULL,          -- trigger kind that fired this run
  matched       INTEGER NOT NULL,       -- 1 if conditions matched
  actions_run   INTEGER NOT NULL,
  error         TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX automation_runs_by_automation ON automation_runs(automation_id, created_at);
