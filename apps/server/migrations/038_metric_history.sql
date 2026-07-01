-- #27 — metric history: a per-user time series of any number stored via custom data, so a value
-- the source keeps no history for (followers, weight, a counter) can be charted as a trend. Written
-- from setCustomData on every numeric write (bucketed to one point per key per minute), pruned to
-- 90 days / 2000 points per key. The primary key doubles as the (user_id, key, at) lookup index.
CREATE TABLE IF NOT EXISTS metric_history (
  user_id TEXT NOT NULL,
  key     TEXT NOT NULL,
  at      INTEGER NOT NULL,   -- ms, bucketed to the minute
  value   REAL NOT NULL,
  PRIMARY KEY (user_id, key, at)
);
