import { createHmac, timingSafeEqual } from "node:crypto";
import { setOrgBilling, orgByStripeCustomer } from "./billing";
import { getOrg } from "./orgs";

// Stripe wiring via the HTTP API (no SDK — same zero-dep, env-gated style as the mailer).
// Inert without STRIPE_SECRET_KEY: every entry point returns null / does nothing, so a
// build with no Stripe keys runs identically. Card data NEVER touches this server — the
// user pays on Stripe's hosted Checkout; we only ever see customer/subscription ids.
//   STRIPE_SECRET_KEY   — secret API key (sk_…)
//   STRIPE_PRICE_ID     — the recurring per-screen Price (price_…)
//   STRIPE_WEBHOOK_SECRET — to verify incoming webhook signatures (whsec_…)

export const stripeConfigured = (): boolean => !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_ID;

async function stripePost(path: string, form: Record<string, string>): Promise<Record<string, unknown> | null> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  if (!res.ok) { console.error(`[stripe] ${path} ${res.status}: ${await res.text().catch(() => "")}`); return null; }
  return (await res.json()) as Record<string, unknown>;
}

/** Start a per-screen subscription Checkout. `screens` = paid screens beyond the free
 *  allowance. Returns the hosted Checkout URL, or null if Stripe isn't configured. */
export async function createCheckout(orgId: string, screens: number, opts: { email?: string; successUrl: string; cancelUrl: string }): Promise<string | null> {
  if (!stripeConfigured()) return null;
  const org = getOrg(orgId);
  if (!org) return null;
  const form: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": process.env.STRIPE_PRICE_ID!,
    "line_items[0][quantity]": String(Math.max(1, screens)),
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    "metadata[orgId]": orgId,
    "subscription_data[metadata][orgId]": orgId,
    allow_promotion_codes: "true",
  };
  if (org.stripe_customer_id) form.customer = org.stripe_customer_id;
  else if (opts.email) form.customer_email = opts.email;
  const session = await stripePost("checkout/sessions", form);
  return (session?.url as string) ?? null;
}

/** Open the Stripe customer portal so an owner can change quantity / payment / cancel. */
export async function createPortal(orgId: string, returnUrl: string): Promise<string | null> {
  if (!stripeConfigured()) return null;
  const org = getOrg(orgId);
  if (!org?.stripe_customer_id) return null;
  const session = await stripePost("billing_portal/sessions", { customer: org.stripe_customer_id, return_url: returnUrl });
  return (session?.url as string) ?? null;
}

/** Verify a Stripe webhook signature (t=…,v1=… scheme). 5-min tolerance. */
function verifySig(raw: string, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")) as [string, string][]);
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // replay window
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Apply a verified Stripe webhook to the org's billing state. Returns false if the
 *  signature is bad (caller → 400) — never throws. */
export function handleWebhook(raw: string, sigHeader: string | undefined): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !verifySig(raw, sigHeader, secret)) return false;
  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(raw); } catch { return false; }
  const obj = event.data?.object ?? {};
  const customerId = (obj.customer as string) || "";
  const orgId = (obj.metadata as Record<string, string> | undefined)?.orgId || (customerId ? orgByStripeCustomer(customerId) : null);
  if (!orgId) return true; // nothing to map → ack so Stripe stops retrying

  if (event.type === "checkout.session.completed") {
    setOrgBilling(orgId, { plan: "team", planStatus: "active", stripeCustomerId: customerId || undefined, stripeSubscriptionId: (obj.subscription as string) || undefined });
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const status = (obj.status as string) || "active";
    const qty = Number((obj.items as { data?: { quantity?: number }[] } | undefined)?.data?.[0]?.quantity ?? 0);
    setOrgBilling(orgId, {
      plan: status === "active" || status === "trialing" ? "team" : "free",
      planStatus: status === "active" || status === "trialing" ? "active" : status === "past_due" ? "past_due" : "canceled",
      screensPaid: Number.isFinite(qty) ? qty : 0,
      stripeCustomerId: customerId || undefined,
      stripeSubscriptionId: (obj.id as string) || undefined,
      currentPeriodEnd: Number((obj.current_period_end as number) ?? 0) * 1000 || undefined,
    });
  } else if (event.type === "customer.subscription.deleted") {
    setOrgBilling(orgId, { plan: "free", planStatus: "canceled", screensPaid: 0, stripeSubscriptionId: null });
  }
  return true;
}
