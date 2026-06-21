import { describe, expect, it } from "vitest";
import { parseRoute, SECTION } from "./router";

describe("router", () => {
  it("parses hash paths to routes (unknown → boards, the home)", () => {
    expect(parseRoute("#/").name).toBe("boards");
    expect(parseRoute("#/boards").name).toBe("boards");
    expect(parseRoute("#/setups").name).toBe("boards"); // legacy alias
    expect(parseRoute("#/screens").name).toBe("screens");
    expect(parseRoute("#/fleet").name).toBe("screens"); // fleet folded into Screens
    expect(parseRoute("#/remote").name).toBe("screens"); // remote folded into Screens
    expect(parseRoute("#/integrations").name).toBe("integrations");
    expect(parseRoute("#/account").name).toBe("account");
    expect(parseRoute("#/edit/42")).toEqual({ name: "edit", layoutId: 42 });
    expect(parseRoute("#/nonsense").name).toBe("boards");
  });

  it("SECTION covers every nav section + account (for breadcrumbs)", () => {
    for (const k of ["boards", "screens", "fleet", "playlists", "hub", "integrations", "account"]) {
      expect(SECTION[k]?.label).toBeTruthy();
      expect(SECTION[k]?.path).toMatch(/^#\//);
    }
  });
});
