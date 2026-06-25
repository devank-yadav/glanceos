import { describe, expect, it } from "vitest";
import { timeAgo } from "./timeAgo";

const NOW = 1_700_000_000_000;
const ago = (ms: number) => timeAgo(NOW - ms, NOW);

describe("timeAgo", () => {
  it("labels recent times", () => {
    expect(ago(0)).toBe("just now");
    expect(ago(30_000)).toBe("just now");
    expect(ago(5 * 60_000)).toBe("5m ago");
    expect(ago(3 * 3_600_000)).toBe("3h ago");
    expect(ago(2 * 86_400_000)).toBe("2d ago");
  });
  it("labels longer spans", () => {
    expect(ago(14 * 86_400_000)).toBe("2w ago");
    expect(ago(60 * 86_400_000)).toBe("2mo ago");
    expect(ago(400 * 86_400_000)).toBe("1y ago");
  });
  it("never goes negative for clock skew", () => {
    expect(timeAgo(NOW + 10_000, NOW)).toBe("just now");
  });
});
