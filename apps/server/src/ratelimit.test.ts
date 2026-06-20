import type { Context } from "hono";
import { describe, expect, it } from "vitest";
import { limiter, rateCheck, setRateBackend } from "./ratelimit";

describe("rateCheck — fixed-window limiter", () => {
  it("allows up to the limit, blocks the next, resets after the window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateCheck("k-allow", 3, 1000, t0).ok).toBe(true);
    const blocked = rateCheck("k-allow", 3, 1000, t0);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(rateCheck("k-allow", 3, 1000, t0 + 1001).ok).toBe(true); // window elapsed
  });

  it("keys are independent", () => {
    expect(rateCheck("k-a", 1, 1000, 5000).ok).toBe(true);
    expect(rateCheck("k-a", 1, 1000, 5000).ok).toBe(false);
    expect(rateCheck("k-b", 1, 1000, 5000).ok).toBe(true); // different key, fresh budget
  });
});

describe("limiter — shared rate backend (Redis path seam)", () => {
  it("defers to the configured backend, then reverts to in-memory", async () => {
    let calls = 0;
    setRateBackend({ check: () => Promise.resolve({ ok: calls++ < 1, retryAfter: 7 }) });
    const mw = limiter("bucket", 100, 1000, () => "fixed-key");
    const ctx = { json: (body: unknown, status: number, headers: Record<string, string>) => ({ body, status, headers }) } as unknown as Context;
    let nexted = 0;
    const next = () => { nexted++; return Promise.resolve(); };

    await mw(ctx, next); // first call: backend allows → next runs
    expect(nexted).toBe(1);
    const blocked = (await mw(ctx, next)) as unknown as { status: number; headers: Record<string, string> };
    expect(nexted).toBe(1); // second: backend blocks → next NOT called
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("7");

    setRateBackend(null); // back to the in-memory default for the rest of the suite
  });
});
