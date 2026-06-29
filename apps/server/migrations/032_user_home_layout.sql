-- #147 — Personal "home board". A user can nominate one board as their home; any of their
-- screens that has no board of its own shows it (resolved only when the board belongs to the
-- screen's org, so there's no cross-org exposure). Additive; existing accounts have NULL.
ALTER TABLE users ADD COLUMN home_layout_id INTEGER;
