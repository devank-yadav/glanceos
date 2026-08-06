import { describe, expect, it } from "vitest";
import { hold, isHeld, unhold } from "./holdCondition";

type Cond = { type: string; conditions?: Cond[]; condition?: Cond; minutes?: number; [k: string]: unknown };

const leaf: Cond = { type: "field", field: "data.cpu", op: "gt", value: 90 };
const group: Cond = { type: "all", conditions: [leaf] };

describe("#16 hold / unhold (one-tap held-vs-instant)", () => {
  it("wraps a whole tree and unwraps back to exactly the original", () => {
    const held = hold(group, 5)!;
    expect(held).toEqual({ type: "sustained", minutes: 5, condition: group });
    expect(isHeld(held)).toBe(true);
    expect(unhold(held)).toEqual(group); // round-trip is lossless
  });

  it("re-holding retimes instead of nesting a second hold", () => {
    const twice = hold(hold(leaf, 5), 30)!;
    expect(twice.minutes).toBe(30);
    expect((twice.condition as Cond).type).toBe("field"); // still one level, not sustained-in-sustained
  });

  it("an empty group has nothing to hold; null/undefined pass through", () => {
    const empty: Cond = { type: "all", conditions: [] };
    expect(hold(empty, 5)).toBe(empty);
    expect(hold(null, 5)).toBeNull();
    expect(hold(undefined, 5)).toBeUndefined();
    expect(isHeld(empty)).toBe(false);
  });

  it("unhold leaves a non-held tree — and a nested hold the author wrote — alone", () => {
    expect(unhold(group)).toEqual(group);
    const nested: Cond = { type: "all", conditions: [{ type: "sustained", minutes: 3, condition: leaf }] };
    expect(isHeld(nested)).toBe(false); // only a ROOT hold is the chip's business
    expect(unhold(nested)).toEqual(nested);
  });
});
