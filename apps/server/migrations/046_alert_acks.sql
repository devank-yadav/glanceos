-- #13 — alert escalation & acknowledgement. An alert that asks to be acknowledged
-- lands here; if nobody acks it before escalate_at, the tick re-raises it louder.
-- Acking happens on the phone / config app / API — never on the wall (it is read-only).
CREATE TABLE IF NOT EXISTS alert_acks (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  body         TEXT,
  severity     TEXT NOT NULL,
  escalate_at  INTEGER,            -- NULL = ack wanted, but no escalation
  escalated_at INTEGER,            -- set once re-raised, so it escalates at most once
  acked_at     INTEGER,            -- set when acknowledged; stops escalation
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alert_acks_open ON alert_acks (user_id, acked_at, escalate_at);
