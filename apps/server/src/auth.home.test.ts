import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-home-"));
const { migrate } = await import("./db");
migrate();
const { createUser, setUserHome, userHomeGeo, getUser } = await import("./auth");

// v6.0 account "home" location: set/clear + bounds, and the userHomeGeo helper the
// geo-inheritance fallback relies on.
describe("account home location", () => {
  const user = createUser("Home", "home@example.com", "pw-12345678")!;

  it("starts unset", () => {
    expect(getUser(user.id)!.homeLatitude).toBeNull();
    expect(userHomeGeo(user.id)).toBeNull();
  });

  it("sets a home (name + coords) and exposes it via userHomeGeo", () => {
    const u = setUserHome(user.id, { name: "Tokyo, Japan", latitude: 35.68, longitude: 139.69 });
    expect(u!.homeLocationName).toBe("Tokyo, Japan");
    expect(userHomeGeo(user.id)).toEqual({ lat: 35.68, lon: 139.69 });
  });

  it("rejects out-of-range coordinates", () => {
    expect(setUserHome(user.id, { name: "Bad", latitude: 200, longitude: 0 })).toBeNull();
    // unchanged after a rejected write
    expect(userHomeGeo(user.id)).toEqual({ lat: 35.68, lon: 139.69 });
  });

  it("clears the home with null", () => {
    expect(setUserHome(user.id, null)!.homeLatitude).toBeNull();
    expect(userHomeGeo(user.id)).toBeNull();
  });
});
