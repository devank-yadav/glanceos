-- Per-screen billing on the org (the billing entity). organizations already has
-- plan ('free') + plan_ref from 025; add the Stripe linkage + the paid-screen count
-- and subscription status. All additive/nullable — a fresh or un-monetized install
-- stays on 'free' with the default free-screen allowance and never needs Stripe.
ALTER TABLE organizations ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE organizations ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE organizations ADD COLUMN plan_status TEXT NOT NULL DEFAULT 'active';  -- active | past_due | canceled
ALTER TABLE organizations ADD COLUMN screens_paid INTEGER NOT NULL DEFAULT 0;     -- paid screens BEYOND the free allowance
ALTER TABLE organizations ADD COLUMN current_period_end INTEGER;
