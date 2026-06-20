-- v1.4 fleet: time-of-day schedules, in-app notifications, and per-device
-- timezone + render options. All additive.

-- A device can switch layouts by wall-clock window (e.g. status board 8–6,
-- clock at night). Highest priority wins on overlap; days_mask is a 7-bit set
-- (bit 0 = Sunday … bit 6 = Saturday); minutes are since local midnight.
CREATE TABLE schedules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  layout_id  INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
  enabled    INTEGER NOT NULL DEFAULT 1,
  priority   INTEGER NOT NULL DEFAULT 0,
  days_mask  INTEGER NOT NULL DEFAULT 127,
  start_min  INTEGER NOT NULL DEFAULT 0,
  end_min    INTEGER NOT NULL DEFAULT 1440,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_schedules_device ON schedules(device_id);

-- In-app alerts (offline / low battery). A partial unique index dedupes while
-- a notification is still unread, so the background check won't spam.
CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id  TEXT,
  kind       TEXT NOT NULL,
  message    TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at    INTEGER
);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE UNIQUE INDEX idx_notifications_dedupe ON notifications(device_id, dedupe_key) WHERE read_at IS NULL;

-- IANA timezone for schedule wall-clock (null = server tz); per-device dither/render options (Phase 4).
ALTER TABLE devices ADD COLUMN timezone TEXT;
ALTER TABLE devices ADD COLUMN render_opts TEXT NOT NULL DEFAULT '{}';
