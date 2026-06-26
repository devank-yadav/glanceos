import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-billing-"));
process.env.GLANCEOS_RATE_LIMIT = "off";
delete process.env.GLANCEOS_FREE_SCREENS; // default = 1

const { migrate } = await import("./db");
const { buildApp } = await import("./api");
const { hmacSign } = await import("./secrets");
const { setOrgBilling } = await import("./billing");

migrate();
const app = buildApp();

const cookieOf = (r: Response): string => `glanceos_session=${/glanceos_session=([a-f0-9]+)/.exec(r.headers.get("set-cookie") ?? "")![1]}`;
const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } as Record<string, string> });
const authed = (cookie: string, body?: unknown) => {
  const token = /glanceos_session=([a-f0-9]+)/.exec(cookie)![1];
  return { ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), cookie, "x-csrf-token": hmacSign(`csrf:${token}`) } as Record<string, string> };
};
const newClaimCode = async (): Promise<string> =>
  (await (await app.request("/api/devices/register", { method: "POST", body: "{}", headers: { "content-type": "application/json" } })).json()).claimCode;

const cookie = cookieOf(await app.request("/api/auth/register", json({ name: "Biller", email: "b@x.com", password: "password123" })));
const orgId = (await (await app.request("/api/auth/status", { headers: { cookie } })).json()).activeOrg.id as string;

describe("per-screen billing limit", () => {
  it("a free workspace can claim its 1 free screen", async () => {
    const res = await app.request("/api/devices/claim", { method: "POST", ...authed(cookie, { code: await newClaimCode(), name: "TV 1" }) });
    expect(res.status).toBe(200);
  });

  it("the 2nd claim is blocked with an upgrade hint", async () => {
    const res = await app.request("/api/devices/claim", { method: "POST", ...authed(cookie, { code: await newClaimCode(), name: "TV 2" }) });
    expect(res.status).toBe(409);
    expect((await res.json()).upgrade).toBe(true);
  });

  it("summary reflects the cap", async () => {
    const s = await (await app.request("/api/billing/summary", { headers: { cookie } })).json();
    expect(s).toMatchObject({ plan: "free", screensUsed: 1, screenLimit: 1, canAddScreen: false });
  });

  it("a paid subscription raises the limit and unblocks claiming", async () => {
    setOrgBilling(orgId, { plan: "team", planStatus: "active", screensPaid: 2 }); // free 1 + 2 paid = 3
    const s = await (await app.request("/api/billing/summary", { headers: { cookie } })).json();
    expect(s).toMatchObject({ plan: "team", screenLimit: 3, canAddScreen: true });
    const res = await app.request("/api/devices/claim", { method: "POST", ...authed(cookie, { code: await newClaimCode(), name: "TV 2" }) });
    expect(res.status).toBe(200);
  });

  it("a canceled subscription falls back to the free allowance", async () => {
    setOrgBilling(orgId, { planStatus: "canceled" });
    const s = await (await app.request("/api/billing/summary", { headers: { cookie } })).json();
    expect(s.screenLimit).toBe(1);
    expect(s.canAddScreen).toBe(false); // already over the free limit
  });
});
