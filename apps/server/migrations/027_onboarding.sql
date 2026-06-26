-- Move onboarding off the client (localStorage) onto the account, and add an
-- activation timestamp for the funnel. onboarded_at = the first-run wizard was
-- completed/dismissed; activated_at = the user's "aha" (first board put on a screen).
-- Both nullable + additive; existing accounts read NULL (not yet onboarded/activated),
-- which is harmless — the client falls back to its existing local flag.
ALTER TABLE users ADD COLUMN onboarded_at INTEGER;
ALTER TABLE users ADD COLUMN activated_at INTEGER;
