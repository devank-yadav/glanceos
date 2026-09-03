import { describe, expect, it } from "vitest";
import { arrivedViaDeepLink, consumeIntended, isAppRoute, parseRoute, rememberIntended, SECTION } from "./router";

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

  it("strips ?query before matching — the server bounces to #/verified?expired=1", () => {
    // Strict equality against the raw hash matched nothing, so both branches of
    // VerifiedPage were unreachable: the expired notice never rendered.
    expect(parseRoute("#/verified?expired=1").name).toBe("verified");
    expect(parseRoute("#/verified").name).toBe("verified");
    expect(parseRoute("#/screens?x=1").name).toBe("screens");
    expect(parseRoute("#/edit/42?from=hub")).toEqual({ name: "edit", layoutId: 42 });
  });

  it("isAppRoute says yes only to routes we actually have", () => {
    expect(isAppRoute("#/screens")).toBe(true);
    expect(isAppRoute("#/edit/42")).toBe(true);
    expect(isAppRoute("#/invite/abc123")).toBe(true);
    expect(isAppRoute("#/verified?expired=1")).toBe(true);
    // In-page anchors on the marketing page — capturing these would yank a
    // logged-out reader who clicked "Pricing" into the sign-in card.
    expect(isAppRoute("#features")).toBe(false);
    expect(isAppRoute("#pricing")).toBe(false);
    // The Boards fallback must not make everything an app route.
    expect(isAppRoute("#/nonsense")).toBe(false);
    expect(isAppRoute("#/")).toBe(false);
    expect(isAppRoute("")).toBe(false);
  });

  it("remembers where you were going, and only same-origin app paths", () => {
    rememberIntended("#/edit/42");
    expect(consumeIntended()).toBe("/edit/42");
    expect(consumeIntended()).toBe(null); // single use

    rememberIntended("#/invite/tok123");
    expect(consumeIntended()).toBe("/invite/tok123");

    // Never anything that could steer the browser off this origin, and never a
    // path we don't recognize.
    for (const bad of ["#//evil.example", "#https://evil.example", "#features", "#/nonsense", "#/"]) {
      rememberIntended(bad);
      expect(consumeIntended()).toBe(null);
    }
  });

  it("deep-link arrival stays observable after the destination is consumed", () => {
    // auth.tsx consumes the destination synchronously right after login, which is
    // before Preact flushes effects — so the first-run bootstrap (which would
    // otherwise auto-create a board and eat an invite) needs a flag that outlives it.
    rememberIntended("#/invite/tok456");
    expect(consumeIntended()).toBe("/invite/tok456");
    expect(arrivedViaDeepLink()).toBe(true);
  });

  it("SECTION covers every nav section + account (for breadcrumbs)", () => {
    for (const k of ["boards", "screens", "fleet", "groups", "hub", "integrations", "account"]) {
      expect(SECTION[k]?.label).toBeTruthy();
      expect(SECTION[k]?.path).toMatch(/^#\//);
    }
  });
});
