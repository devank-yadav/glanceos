import { describe, expect, it } from "vitest";
import { checkConfig } from "./config";

describe("checkConfig", () => {
  it("passes a clean / empty env", () => {
    expect(checkConfig({}).errors).toEqual([]);
  });

  it("flags non-numeric / out-of-range numbers", () => {
    expect(checkConfig({ GLANCEOS_UPLOAD_QUOTA_MB: "lots" }).errors).toHaveLength(1);
    expect(checkConfig({ GLANCEOS_KEY_VERSION: "0" }).errors).toHaveLength(1); // min 1
    expect(checkConfig({ PORT: "-3" }).errors).toHaveLength(1);
  });

  it("requires GLANCEOS_PUBLIC_URL to be an http(s) URL", () => {
    expect(checkConfig({ GLANCEOS_PUBLIC_URL: "not a url" }).errors).toHaveLength(1);
    expect(checkConfig({ GLANCEOS_PUBLIC_URL: "https://glance.example" }).errors).toEqual([]);
  });

  it("warns (not errors) on disabled rate limiting + a short secret key", () => {
    const r = checkConfig({ GLANCEOS_RATE_LIMIT: "off", GLANCEOS_SECRET_KEY: "short" });
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
  });
});
