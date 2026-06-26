import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-emailflow-"));
process.env.GLANCEOS_RATE_LIMIT = "off";

const { migrate, db } = await import("./db");
const { buildApp } = await import("./api");

migrate();
const app = buildApp();

const cookieOf = (r: Response): string => `glanceos_session=${/glanceos_session=([a-f0-9]+)/.exec(r.headers.get("set-cookie") ?? "")![1]}`;
const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } as Record<string, string> });
const tokenOf = (kind: string): string => (db.prepare("SELECT token FROM auth_tokens WHERE kind = ? ORDER BY rowid DESC LIMIT 1").get(kind) as { token: string }).token;

const cookie = cookieOf(await app.request("/api/auth/register", json({ name: "Verifier", email: "v@x.com", password: "password123" })));

describe("transactional email flows (inert backend → no throws)", () => {
  it("registration mints a verify token and the account starts unverified", async () => {
    const s = await (await app.request("/api/auth/status", { headers: { cookie } })).json();
    expect(s.user.emailVerified).toBe(false);
    expect(tokenOf("verify")).toBeTruthy();
  });

  it("the verify link marks the email verified", async () => {
    const res = await app.request(`/api/auth/verify/${tokenOf("verify")}`);
    expect(res.status).toBe(302); // redirects back into the app
    const s = await (await app.request("/api/auth/status", { headers: { cookie } })).json();
    expect(s.user.emailVerified).toBe(true);
  });

  it("forgot → reset changes the password and invalidates old sessions", async () => {
    expect((await app.request("/api/auth/forgot", json({ email: "v@x.com" }))).status).toBe(200);
    const reset = await app.request("/api/auth/reset", json({ token: tokenOf("reset"), password: "brand-new-pw-9" }));
    expect(reset.status).toBe(200);
    // old password no longer works; new one does
    expect((await app.request("/api/auth/login", json({ email: "v@x.com", password: "password123" }))).status).toBe(401);
    expect((await app.request("/api/auth/login", json({ email: "v@x.com", password: "brand-new-pw-9" }))).status).toBe(200);
  });

  it("forgot for an unknown email still returns ok (no account enumeration)", async () => {
    const before = (db.prepare("SELECT COUNT(*) AS n FROM auth_tokens WHERE kind='reset'").get() as { n: number }).n;
    expect((await app.request("/api/auth/forgot", json({ email: "nobody@nowhere.com" }))).status).toBe(200);
    const after = (db.prepare("SELECT COUNT(*) AS n FROM auth_tokens WHERE kind='reset'").get() as { n: number }).n;
    expect(after).toBe(before); // no token minted for a non-existent account
  });

  it("a used/invalid reset token is rejected", async () => {
    expect((await app.request("/api/auth/reset", json({ token: "deadbeef", password: "whatever12" }))).status).toBe(400);
  });
});
