import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError, cached, httpError, isPrivate, RateLimitError } from "./cache";

describe("isPrivate — SSRF address guard (incl. IPv4-mapped IPv6)", () => {
  it("blocks every private/loopback/link-local/CGNAT/metadata IPv4 range", () => {
    for (const ip of ["127.0.0.1", "0.0.0.0", "10.1.2.3", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "100.127.255.255"]) {
      expect(isPrivate(ip), ip).toBe(true);
    }
  });
  it("blocks the same ranges in IPv4-mapped IPv6 form (the bypass)", () => {
    for (const ip of ["::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:172.16.0.1", "::ffff:100.64.0.1", "[::ffff:192.168.0.1]"]) {
      expect(isPrivate(ip), ip).toBe(true);
    }
    expect(isPrivate("::ffff:a9fe:a9fe"), "hex-mapped 169.254.169.254").toBe(true); // hex tail
    expect(isPrivate("::ffff:7f00:1"), "hex-mapped 127.0.0.1").toBe(true);
  });
  it("blocks IPv6 loopback / ULA / link-local / unspecified (with zone ids)", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0"]) {
      expect(isPrivate(ip), ip).toBe(true);
    }
  });
  it("allows public addresses (v4 + v6)", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "140.82.112.3", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPrivate(ip), ip).toBe(false);
    }
  });
});

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
