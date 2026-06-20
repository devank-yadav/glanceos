import { describe, expect, it } from "vitest";
import { applySafeArea, enableTvMode, isTvMode } from "./tv";

describe("tv mode", () => {
  it("applySafeArea sets the --safe-* CSS vars and defaults to 0%", () => {
    applySafeArea({ top: 5, right: 4, bottom: 3, left: 2 });
    expect(document.documentElement.style.getPropertyValue("--safe-top")).toBe("5%");
    expect(document.documentElement.style.getPropertyValue("--safe-right")).toBe("4%");
    applySafeArea(undefined);
    expect(document.documentElement.style.getPropertyValue("--safe-left")).toBe("0%");
  });

  it("enableTvMode flags the body and is idempotent", () => {
    expect(isTvMode()).toBe(false);
    enableTvMode();
    expect(isTvMode()).toBe(true);
    expect(document.body.classList.contains("tv")).toBe(true);
    enableTvMode(); // second call is a no-op, must not throw
    expect(isTvMode()).toBe(true);
  });
});
