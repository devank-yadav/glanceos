import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-tvstate-"));
const { wakePower } = await import("./state");

describe("wakePower (wake/sleep window)", () => {
  it("no window → always on", () => {
    expect(wakePower(undefined, 0, 0)).toBe("on");
    expect(wakePower(undefined, 720, 3)).toBe("on");
  });

  it("inside the window → on, outside → off", () => {
    const w = { startMin: 420, endMin: 1380, daysMask: 127 }; // 07:00–23:00, every day
    expect(wakePower(w, 600, 1)).toBe("on");  // 10:00
    expect(wakePower(w, 100, 1)).toBe("off"); // 01:40
  });

  it("an inactive weekday is off all day", () => {
    const monToFri = 0b0111110; // bits 1..5
    const w = { startMin: 0, endMin: 1439, daysMask: monToFri };
    expect(wakePower(w, 600, 0)).toBe("off"); // Sunday (bit 0)
    expect(wakePower(w, 600, 1)).toBe("on");  // Monday
  });

  it("an overnight window wraps past midnight", () => {
    const w = { startMin: 1320, endMin: 360, daysMask: 127 }; // 22:00–06:00
    expect(wakePower(w, 1380, 2)).toBe("on");  // 23:00
    expect(wakePower(w, 120, 2)).toBe("on");   // 02:00
    expect(wakePower(w, 720, 2)).toBe("off");  // 12:00
  });
});
