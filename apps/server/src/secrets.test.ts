import { describe, expect, it } from "vitest";
import { open, seal } from "./secrets";

describe("secrets — AES-256-GCM at rest", () => {
  it("round-trips and the ciphertext is not the plaintext", () => {
    const token = "tok_super_secret_value_42";
    const cipher = seal(token);
    expect(open(cipher)).toBe(token);
    expect(cipher.toString("latin1")).not.toContain(token); // never stored readable
    expect(cipher.length).toBeGreaterThan(28); // iv(12)+tag(16)+ciphertext
  });

  it("returns null on a tampered or undersized blob, never throws", () => {
    const cipher = seal("hello");
    const tampered = Buffer.from(cipher);
    tampered[tampered.length - 1] ^= 0xff; // flip a ciphertext bit → auth tag fails
    expect(open(tampered)).toBeNull();
    expect(open(Buffer.from("short"))).toBeNull();
    expect(open(null)).toBeNull();
  });
});
