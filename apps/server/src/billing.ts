import { db } from "./db";
import { listDevices } from "./devices";
import { getOrg, type OrgRow } from "./orgs";

// Per-screen billing logic. The org is the billing entity. Plan model: a free org gets
// FREE_SCREENS connected screens; a paying org gets FREE_SCREENS + screens_paid. The
// limit is enforced at claim time. This module is the single source of truth for "how
// many screens may this org connect" and is independent of Stripe — Stripe (billing.ts
// callers in api.ts, P7b) only ever updates screens_paid/plan via setOrgBilling().

export const FREE_SCREENS = (() => {
  const n = Number(process.env.GLANCEOS_FREE_SCREENS);
  return Number.isInteger(n) && n >= 0 ? n : 1;
})();

/** How many screens this org may have connected. Free (or a lapsed sub) → the free
 *  allowance; an active paid sub → free + paid. */
export function screenLimit(org: OrgRow): number {
  const paid = org.plan !== "free" && org.plan_status === "active" ? org.screens_paid : 0;
  return FREE_SCREENS + paid;
}

export interface BillingSummary {
  plan: string;
  status: string;
  screensUsed: number;
  screenLimit: number;
  freeScreens: number;
  screensPaid: number;
  canAddScreen: boolean;
  periodEnd: number | null;
  managed: boolean; // true once linked to a Stripe customer
}

export function billingSummary(orgId: string): BillingSummary | null {
  const org = getOrg(orgId);
  if (!org) return null;
  const limit = screenLimit(org);
  const used = listDevices(orgId).length;
  return {
    plan: org.plan,
    status: org.plan_status,
    screensUsed: used,
    screenLimit: limit,
    freeScreens: FREE_SCREENS,
    screensPaid: org.screens_paid,
    canAddScreen: used < limit,
    periodEnd: org.current_period_end,
    managed: !!org.stripe_customer_id,
  };
}

/** Can this org connect one more screen right now? Enforced at the claim route. */
export function canAddScreen(orgId: string): boolean {
  const org = getOrg(orgId);
  if (!org) return false;
  return listDevices(orgId).length < screenLimit(org);
}

export interface OrgBillingPatch {
  plan?: string;
  planStatus?: string;
  screensPaid?: number;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: number | null;
}

/** Apply a billing state change (from a Stripe webhook). Only the provided fields move. */
export function setOrgBilling(orgId: string, patch: OrgBillingPatch): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };
  if (patch.plan !== undefined) add("plan", patch.plan);
  if (patch.planStatus !== undefined) add("plan_status", patch.planStatus);
  if (patch.screensPaid !== undefined) add("screens_paid", patch.screensPaid);
  if (patch.stripeCustomerId !== undefined) add("stripe_customer_id", patch.stripeCustomerId);
  if (patch.stripeSubscriptionId !== undefined) add("stripe_subscription_id", patch.stripeSubscriptionId);
  if (patch.currentPeriodEnd !== undefined) add("current_period_end", patch.currentPeriodEnd);
  if (!sets.length) return;
  db.prepare(`UPDATE organizations SET ${sets.join(", ")} WHERE id = ?`).run(...vals, orgId);
}

/** Find the org a Stripe customer belongs to (webhook → org). */
export function orgByStripeCustomer(customerId: string): string | null {
  const row = db.prepare("SELECT id FROM organizations WHERE stripe_customer_id = ?").get(customerId) as { id: string } | undefined;
  return row?.id ?? null;
}
