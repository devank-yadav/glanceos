import { describe, expect, it } from "vitest";
import { needsOnboarding } from "./onboarding";

describe("needsOnboarding", () => {
  it("shows only on a fresh, undismissed account", () => {
    expect(needsOnboarding({ deviceCount: 0, layoutCount: 0, dismissed: false })).toBe(true);
  });
  it("hides once dismissed", () => {
    expect(needsOnboarding({ deviceCount: 0, layoutCount: 0, dismissed: true })).toBe(false);
  });
  it("hides when there's already a board or a screen", () => {
    expect(needsOnboarding({ deviceCount: 0, layoutCount: 1, dismissed: false })).toBe(false);
    expect(needsOnboarding({ deviceCount: 1, layoutCount: 0, dismissed: false })).toBe(false);
  });
});
