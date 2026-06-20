import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError, cached, httpError, RateLimitError } from "./cache";

describe("httpError — typed fetch failures", () => {
  it("401/403 → AuthError", () => {
    expect(httpError(new Response("", { status: 401 }))).toBeInstanceOf(AuthError);
    expect(httpError(new Response("", { status: 403 }))).toBeInstanceOf(AuthError);
  });
  it("429 → RateLimitError, Retry-After in delta-seconds", () => {
    const e = httpError(new Response("", { status: 429, headers: { "retry-after": "30" } }));
    expect(e).toBeInstanceOf(RateLimitError);
    expect((e as RateLimitError).retryAfterMs).toBe(30_000);
  });
  it("429 with no headers → default 60s backoff", () => {
    expect((httpError(new Response("", { status: 429 })) as RateLimitError).retryAfterMs).toBe(60_000);
  });
  it("other statuses → generic Error", () => {
    const e = httpError(new Response("", { status: 500 }));
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(AuthError);
    expect(e).not.toBeInstanceOf(RateLimitError);
  });
});

describe("cached() — backoff", () => {
  afterEach(() => vi.useRealTimers());

  it("a 429 backs off for its retry window, then refetches", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fn = async () => { calls++; if (calls === 1) throw new RateLimitError(120_000); return { ok: true }; };
    const k = "test:429";
    expect(await cached(k, 1000, 5000, fn)).toBeNull(); // 429 → null
    expect(calls).toBe(1);
    expect(await cached(k, 1000, 5000, fn)).toBeNull(); // within 120s window: no refetch
    expect(calls).toBe(1);
    vi.advanceTimersByTime(121_000);
    expect(await cached(k, 1000, 5000, fn)).toEqual({ ok: true }); // window elapsed: refetch
    expect(calls).toBe(2);
  });

  it("a generic failure uses failTtl, not the 429 window", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fn = async () => { calls++; throw new Error("boom"); };
    const k = "test:fail";
    await cached(k, 1000, 5000, fn); expect(calls).toBe(1);
    vi.advanceTimersByTime(3000); await cached(k, 1000, 5000, fn); expect(calls).toBe(1); // within failTtl
    vi.advanceTimersByTime(3000); await cached(k, 1000, 5000, fn); expect(calls).toBe(2); // after failTtl
  });
});
