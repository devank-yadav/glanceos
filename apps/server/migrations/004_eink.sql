-- E-ink platform: device telemetry + refresh control, and playlists (a screen
-- rotates through several setups). Playlists are created first so the new
-- devices.playlist_id foreign key can reference them.

CREATE TABLE playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  interval_seconds INTEGER NOT NULL DEFAULT 300,
  created_at INTEGER NOT NULL
);

CREATE TABLE playlist_items (
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  layout_id INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
  PRIMARY KEY (playlist_id, position)
);

-- Telemetry + refresh + optional playlist on each device.
ALTER TABLE devices ADD COLUMN refresh_seconds INTEGER NOT NULL DEFAULT 900;
ALTER TABLE devices ADD COLUMN playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL;
ALTER TABLE devices ADD COLUMN battery INTEGER;     -- percent 0..100
ALTER TABLE devices ADD COLUMN rssi INTEGER;        -- Wi-Fi signal, dBm
ALTER TABLE devices ADD COLUMN firmware TEXT;
ALTER TABLE devices ADD COLUMN last_seen INTEGER;   -- ms epoch of last device contact

CREATE INDEX idx_playlists_user ON playlists(user_id);
CREATE INDEX idx_playlist_items ON playlist_items(playlist_id, position);
