import { describe, expect, it } from "vitest";
import { CAST_NAMESPACE, parseCastMessage } from "./cast";

describe("parseCastMessage", () => {
  it("extracts a board share token", () => {
    expect(parseCastMessage({ type: "board", shareToken: "abc123" })).toEqual({ shareToken: "abc123" });
  });
  it("rejects junk, wrong type, or an empty token", () => {
    expect(parseCastMessage(null)).toBeNull();
    expect(parseCastMessage("string")).toBeNull();
    expect(parseCastMessage({ type: "board" })).toBeNull();
    expect(parseCastMessage({ type: "other", shareToken: "x" })).toBeNull();
    expect(parseCastMessage({ type: "board", shareToken: "" })).toBeNull();
  });
  it("uses the GlanceOS custom namespace", () => {
    expect(CAST_NAMESPACE).toBe("urn:x-cast:com.glanceos.cast");
  });
});
