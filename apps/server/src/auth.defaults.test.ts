import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-bdefaults-"));
const { migrate } = await import("./db");
migrate();
const { createUser, getUser, setUserBoardDefaults, sanitizeBoardDefaults } = await import("./auth");
const { blankDocument } = await import("./layouts");

// #155 — the user's default theme for every NEW board.
describe("#155 new-board defaults", () => {
  it("sanitize keeps only known values (a bad payload can't corrupt board creation)", () => {
    expect(sanitizeBoardDefaults({ mode: "dark", fontScale: "l", look: "terminal" })).toEqual({ mode: "dark", fontScale: "l", look: "terminal" });
    expect(sanitizeBoardDefaults({ mode: "neon", fontScale: "xxl", look: "comic-sans" })).toBeNull(); // all unknown → null
    expect(sanitizeBoardDefaults({ mode: "auto", look: "nope" })).toEqual({ mode: "auto" }); // partial keep
    expect(sanitizeBoardDefaults("dark")).toBeNull();
    expect(sanitizeBoardDefaults(null)).toBeNull();
  });

  it("round-trips through the user record; {}/garbage clears", () => {
    const u = createUser("BD", "bd@example.com", "password123")!;
    setUserBoardDefaults(u.id, { mode: "dark", fontScale: "l" });
    expect(getUser(u.id)!.boardDefaults).toEqual({ mode: "dark", fontScale: "l" });
    setUserBoardDefaults(u.id, {});
    expect(getUser(u.id)!.boardDefaults).toBeNull();
  });

  it("blankDocument applies the defaults; absent = stock theme", () => {
    const themed = blankDocument("Mine", { mode: "dark", fontScale: "l", look: "grotesk" });
    expect(themed.theme).toMatchObject({ mode: "dark", fontScale: "l", look: "grotesk" });
    const stock = blankDocument("Plain");
    expect(stock.theme).toMatchObject({ mode: "light", fontScale: "m" });
    expect(stock.theme.look).toBeUndefined();
  });
});
