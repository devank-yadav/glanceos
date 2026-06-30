-- #48 — Per-device block overrides. From one shared board, a specific screen can override a
-- block's props (e.g. the kitchen screen's weather block uses the kitchen's coordinates). The
-- override is a partial props patch merged into the block at compose time. Additive.
CREATE TABLE IF NOT EXISTS device_overrides (
  device_id  TEXT NOT NULL,
  block_id   TEXT NOT NULL,
  props      TEXT NOT NULL,        -- JSON: a partial props patch merged over the block's props
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, block_id)
);
CREATE INDEX IF NOT EXISTS idx_device_overrides_dev ON device_overrides (device_id);
