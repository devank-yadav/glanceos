import { describe, expect, it } from "vitest";
import { onboardSteps } from "./onboardSteps";

describe("#122 onboardSteps (real counts, not wizard state)", () => {
  it("a fresh account has all four steps open", () => {
    const s = onboardSteps({ boards: 0, screens: 0, automations: 0, connections: [] });
    expect(s).toHaveLength(4);
    expect(s.every((x) => !x.done)).toBe(true);
    expect(s.map((x) => x.key)).toEqual(["board", "screen", "data", "rule"]);
  });

  it("each count independently completes its step", () => {
    const s = onboardSteps({ boards: 2, screens: 0, automations: 1, connections: [{ status: "needs_auth" }] });
    expect(s.find((x) => x.key === "board")!.done).toBe(true);
    expect(s.find((x) => x.key === "screen")!.done).toBe(false);
    expect(s.find((x) => x.key === "data")!.done).toBe(true); // even a needs-auth connection counts as "connected"
    expect(s.find((x) => x.key === "rule")!.done).toBe(true);
  });
});
