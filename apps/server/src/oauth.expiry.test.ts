import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-tokexp-"));
const { migrate } = await import("./db");
migrate();
const { createUser } = await import("./auth");
const { saveOAuthConnection, sweepTokenExpiry, tokenExpiryInfo } = await import("./oauth");
const { listNotifications } = await import("./notifications");

const DAY = 86_400_000;

// #32 — proactive warnings for tokens that can't renew themselves. A refresh-less
// token with a finite expiry is a countdown nobody can see; the sweep makes it a
// bell notification days before the wall goes stale.
describe("#32 token-expiry warnings", () => {
  it("warns once (deduped) for a non-renewable token inside the window", () => {
    const u = createUser("Tok", "tok@example.com", "password123")!;
    const now = Date.now();
    const id = saveOAuthConnection(u.id, "github", { access: "a", refresh: null, expiresAt: now + 2 * DAY });
    expect(tokenExpiryInfo(id)).toBe(now + 2 * DAY);
    sweepTokenExpiry(now);
    const notifs = listNotifications(u.id);
    expect(notifs.length).toBe(1);
    expect(notifs[0]!.message).toContain("expires in ~2 day");
    sweepTokenExpiry(now + 60_000); // the 6h timer fires again → same token, no repeat
    expect(listNotifications(u.id).length).toBe(1);
  });

  it("stays quiet for auto-renewing, far-future, and already-expired tokens", () => {
    const u = createUser("Tok2", "tok2@example.com", "password123")!;
    const now = Date.now();
    saveOAuthConnection(u.id, "google", { access: "a", refresh: "r", expiresAt: now + DAY }); // renews itself
    saveOAuthConnection(u.id, "github", { access: "a", refresh: null, expiresAt: now + 30 * DAY }); // far out
    sweepTokenExpiry(now);
    expect(listNotifications(u.id).length).toBe(0);
    // expired → the needs_auth path owns it; warning about the past helps nobody
    saveOAuthConnection(u.id, "strava", { access: "a", refresh: null, expiresAt: now - DAY });
    sweepTokenExpiry(now);
    expect(listNotifications(u.id).length).toBe(0);
  });

  it("a never-expiring token (GitHub-style sentinel) reports no expiry at all", () => {
    const u = createUser("Tok3", "tok3@example.com", "password123")!;
    const id = saveOAuthConnection(u.id, "discord", { access: "a", refresh: null, expiresAt: Number.MAX_SAFE_INTEGER });
    expect(tokenExpiryInfo(id)).toBeNull();
  });
});
