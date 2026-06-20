import { describe, expect, it } from "vitest";
import { parseRoute, SECTION } from "./router";

describe("router", () => {
  it("parses hash paths to routes (unknown → screens)", () => {
    expect(parseRoute("#/").name).toBe("screens");
    expect(parseRoute("#/fleet").name).toBe("fleet");
    expect(parseRoute("#/integrations").name).toBe("integrations");
    expect(parseRoute("#/account").name).toBe("account");
    expect(parseRoute("#/edit/42")).toEqual({ name: "edit", layoutId: 42 });
    expect(parseRoute("#/nonsense").name).toBe("screens");
  });

  it("SECTION covers every nav section + account (for breadcrumbs)", () => {
    for (const k of ["screens", "fleet", "setups", "playlists", "hub", "integrations", "account"]) {
      expect(SECTION[k]?.label).toBeTruthy();
      expect(SECTION[k]?.path).toMatch(/^#\//);
    }
  });
});
