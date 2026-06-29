-- #1 — Persist engine history. The automation engine's sensing state (trend ring-buffer,
-- stale last-change stamps, sustained first-true timestamps, "changed" prev-context,
-- online/presence edges, time-fire dedupe) and the deferred-action queue live in memory
-- and re-baseline on every restart. Persist them (one JSON row per map, flushed each tick,
-- hydrated on boot) so rules survive a deploy instead of forgetting their history.
CREATE TABLE IF NOT EXISTS engine_state (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
