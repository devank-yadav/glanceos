import { describe, expect, it } from "vitest";
import { newClaimCode, normalizeClaimCode } from "./ids";

describe("claim codes", () => {
  it("uses the unambiguous alphabet and XXX-XXX shape", () => {
    const shape = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}$/;
    for (let i = 0; i < 200; i++) expect(newClaimCode()).toMatch(shape);
  });

  it("normalizes sloppy user input", () => {
    expect(normalizeClaimCode("7qk d2f")).toBe("7QK-D2F");
    expect(normalizeClaimCode("7QK-D2F")).toBe("7QK-D2F");
    expect(normalizeClaimCode("7qkd2f")).toBe("7QK-D2F");
  });
});
