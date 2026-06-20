import { describe, expect, it } from "vitest";
import { rateCheck } from "./ratelimit";

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
