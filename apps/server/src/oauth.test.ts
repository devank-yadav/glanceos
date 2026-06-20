import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { mapGoogleEvents, type OAuthSpec } from "./providers/registry";
import {
  buildAuthorizeUrl, exchangeCode, NoOAuthApp, pkcePair, refreshAccessToken,
  signState, tokensFromResp, verifyState,
} from "./oauth";

const SPEC: OAuthSpec = {
  authorizeUrl: "https://example.com/auth",
  tokenUrl: "https://example.com/token",
  scopes: ["a", "b"],
};

describe("PKCE", () => {
  it("challenge is the base64url SHA-256 of the verifier", () => {
    const { verifier, challenge } = pkcePair();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(verifier).not.toBe(challenge);
  });
  it("produces a fresh verifier each call", () => {
    expect(pkcePair().verifier).not.toBe(pkcePair().verifier);
  });
});

describe("signed state", () => {
  it("round-trips a payload", () => {
    const token = signState({ sid: "s1", userId: "u1", provider: "google", exp: Date.now() + 10_000 });
    expect(verifyState(token)).toMatchObject({ sid: "s1", userId: "u1", provider: "google" });
  });
  it("rejects a tampered body", () => {
    const token = signState({ sid: "s1", exp: Date.now() + 10_000 });
    const [body, sig] = token.split(".");
    const tampered = `${body}x.${sig}`;
    expect(verifyState(tampered)).toBeNull();
  });
  it("rejects a tampered signature", () => {
    const token = signState({ sid: "s1", exp: Date.now() + 10_000 });
    const [body] = token.split(".");
    expect(verifyState(`${body}.deadbeef`)).toBeNull();
  });
  it("rejects an expired state", () => {
    expect(verifyState(signState({ sid: "s1", exp: Date.now() - 1 }))).toBeNull();
  });
  it("rejects garbage", () => {
    expect(verifyState("not-a-token")).toBeNull();
  });
});

describe("token exchange + refresh (mocked endpoint, no network)", () => {
  it("exchangeCode POSTs the auth-code grant and parses tokens", async () => {
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(init.body as string);
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("CODE");
      expect(body.get("code_verifier")).toBe("VER");
      expect(body.get("client_id")).toBe("cid");
      expect(body.get("client_secret")).toBe("csecret");
      return new Response(JSON.stringify({ access_token: "AT", refresh_token: "RT", expires_in: 3600 }), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const r = await exchangeCode(SPEC, { clientId: "cid", clientSecret: "csecret" }, "CODE", "VER", "https://app/cb", f);
    expect(r.access_token).toBe("AT");
  });

  it("refreshAccessToken POSTs the refresh grant", async () => {
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(init.body as string);
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("RT");
      return new Response(JSON.stringify({ access_token: "AT2", expires_in: 3600 }), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const r = await refreshAccessToken(SPEC, { clientId: "cid", clientSecret: "csecret" }, "RT", f);
    expect(r.access_token).toBe("AT2");
  });

  it("tokenAuth:'basic' sends client creds in the Authorization header, not the body", async () => {
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      expect(headers.authorization).toBe(`Basic ${Buffer.from("cid:csecret").toString("base64")}`);
      const body = new URLSearchParams(init.body as string);
      expect(body.get("client_id")).toBeNull();
      expect(body.get("client_secret")).toBeNull();
      expect(body.get("code")).toBe("CODE");
      return new Response(JSON.stringify({ access_token: "AT" }), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    await exchangeCode({ ...SPEC, tokenAuth: "basic" }, { clientId: "cid", clientSecret: "csecret" }, "CODE", "VER", "https://app/cb", f);
  });
});

describe("non-expiring tokens", () => {
  it("a response with no expires_in + nonExpiring → far-future expiry (never refreshes)", () => {
    expect(tokensFromResp({ access_token: "AT" }, null, true)?.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("without the hint, a missing expires_in defaults to ~1h", () => {
    const t = tokensFromResp({ access_token: "AT" });
    expect(t!.expiresAt).toBeGreaterThan(Date.now());
    expect(t!.expiresAt).toBeLessThan(Date.now() + 2 * 3600_000);
  });
});

describe("tokensFromResp", () => {
  it("maps fields and computes expiry", () => {
    const t = tokensFromResp({ access_token: "AT", refresh_token: "RT", expires_in: 3600 });
    expect(t?.access).toBe("AT");
    expect(t?.refresh).toBe("RT");
    expect(t!.expiresAt).toBeGreaterThan(Date.now());
  });
  it("keeps the previous refresh token when the response omits one", () => {
    expect(tokensFromResp({ access_token: "AT2", expires_in: 3600 }, "OLD_RT")?.refresh).toBe("OLD_RT");
  });
  it("null when there's no access token", () => {
    expect(tokensFromResp({ error: "invalid_grant" })).toBeNull();
  });
});

describe("buildAuthorizeUrl", () => {
  it("throws NoOAuthApp when the self-hoster hasn't registered an app", () => {
    // no oauth_apps row exists for this random user → must refuse to start
    expect(() => buildAuthorizeUrl("no-such-user", "google", "https://app/cb")).toThrow(NoOAuthApp);
  });
});

describe("mapGoogleEvents", () => {
  it("shapes timed + all-day events and drops start-less ones", () => {
    const { events } = mapGoogleEvents([
      { summary: "Standup", start: { dateTime: "2026-06-19T09:00:00Z" }, end: { dateTime: "2026-06-19T09:15:00Z" } },
      { summary: "Holiday", start: { date: "2026-06-20" }, end: { date: "2026-06-21" } },
      { start: {} }, // no start → dropped
      { start: { dateTime: "2026-06-19T12:00:00Z" } }, // no summary → "(busy)"
    ]);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ title: "Standup", start: "2026-06-19T09:00:00Z" });
    expect(events[1]).toMatchObject({ title: "Holiday", start: "2026-06-20" });
    expect(events[2]!.title).toBe("(busy)");
  });
});
