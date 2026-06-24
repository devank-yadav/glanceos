import { describe, expect, it } from "vitest";
import { parseClaimCode } from "./claim";

describe("parseClaimCode (QR pairing deep-link)", () => {
  it("reads ?claim and keeps a valid code", () => {
    expect(parseClaimCode("?claim=7QK-D2F")).toBe("7QK-D2F");
    expect(parseClaimCode("?foo=1&claim=ABCD")).toBe("ABCD");
  });

  it("sanitizes stray characters", () => {
    expect(parseClaimCode("?claim=7q k/d2f!")).toBe("7qkd2f");
  });

  it("returns null for missing / too-short codes", () => {
    expect(parseClaimCode("")).toBeNull();
    expect(parseClaimCode("?x=1")).toBeNull();
    expect(parseClaimCode("?claim=ab")).toBeNull();
    expect(parseClaimCode("?claim=")).toBeNull();
  });
});
