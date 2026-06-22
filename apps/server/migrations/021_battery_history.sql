-- v6.1: two-point battery drain for a "~N days left" forecast. We keep just the
-- PREVIOUS distinct reading (+ its timestamp) on the device row — not an unbounded
-- history table — so a slope is computable without any growth/GC concern.
ALTER TABLE devices ADD COLUMN prev_battery INTEGER;
ALTER TABLE devices ADD COLUMN prev_battery_at INTEGER;
