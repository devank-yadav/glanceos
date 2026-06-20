import { scryptSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Set the keys before secrets.ts loads (it derives them at import).
process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-rotate-"));
process.env.GLANCEOS_SECRET_KEY = "new-secret-key";
process.env.GLANCEOS_SECRET_KEY_PREVIOUS = "old-secret-key";
const { sealWith, openWith, seal, open, currentKeyVersion } = await import("./secrets");

const derive = (s: string): Buffer => scryptSync(s, "glanceos.connections", 32);

describe("secret rotation", () => {
  it("sealWith/openWith round-trips; a different key → null", () => {
    const blob = sealWith(derive("k1"), "hello");
    expect(openWith(derive("k1"), blob)).toBe("hello");
    expect(openWith(derive("k2"), blob)).toBeNull();
  });

  it("open() decrypts current-key blobs AND falls back to the previous key", () => {
    expect(open(seal("fresh"))).toBe("fresh"); // current key
    const legacy = sealWith(derive("old-secret-key"), "legacy");
    expect(open(legacy)).toBe("legacy"); // previous-key fallback during a rotation
  });

  it("currentKeyVersion defaults to 1", () => {
    expect(currentKeyVersion()).toBe(1);
  });
});
