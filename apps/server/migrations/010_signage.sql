-- v1.9 digital signage: manage many screens as groups, with a group-level
-- default board, group schedules, and proof-of-play logging. All additive; a
-- device with no group behaves exactly as before.

-- A display group: a set of screens that share a default board / playlist and
-- (optionally) a schedule. Timezone is the group's wall clock for its schedules.
CREATE TABLE display_groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  timezone    TEXT,
  layout_id   INTEGER REFERENCES layouts(id) ON DELETE SET NULL,   -- group default board
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL, -- or a group playlist
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_display_groups_user ON display_groups(user_id);

-- A device may belong to one group; clearing the group falls back to its own settings.
ALTER TABLE devices ADD COLUMN group_id INTEGER REFERENCES display_groups(id) ON DELETE SET NULL;

-- Group-level time-of-day schedules — same shape + engine as device schedules (007).
CREATE TABLE group_schedules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id   INTEGER NOT NULL REFERENCES display_groups(id) ON DELETE CASCADE,
  layout_id  INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
  enabled    INTEGER NOT NULL DEFAULT 1,
  priority   INTEGER NOT NULL DEFAULT 0,
  days_mask  INTEGER NOT NULL DEFAULT 127,
  start_min  INTEGER NOT NULL DEFAULT 0,
  end_min    INTEGER NOT NULL DEFAULT 1440,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_group_schedules_group ON group_schedules(group_id);

-- Proof-of-play: what each screen actually showed, when, for how long. Pruned
-- on a retention timer. zone_id is set once multi-zone layouts log per zone.
CREATE TABLE proof_of_play (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  layout_id   INTEGER,
  zone_id     TEXT,
  shown_at    INTEGER NOT NULL,
  duration_ms INTEGER
);
CREATE INDEX idx_pop_device_time ON proof_of_play(device_id, shown_at);
