import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-shares-"));
const { migrate } = await import("./db");
migrate();
const { createUser } = await import("./auth");
const { blankDocument, createLayout } = await import("./layouts");
const { ensurePersonalOrg } = await import("./orgs");
const { createShare, revokeShare, updateShareAccess, layoutAccess, getReadableLayout, getWritableLayout, sharedLayouts } = await import("./shares");

const owner = createUser("Owner", "owner@example.com", "password123")!;
const grantee = createUser("Grantee", "grantee@example.com", "password123")!;
const stranger = createUser("Stranger", "stranger@example.com", "password123")!;
const ownerOrg = ensurePersonalOrg(owner.id); // board belongs to the owner's org; grantee/stranger are non-members
const board = createLayout("Lobby", blankDocument("Lobby"), { userId: owner.id, orgId: ownerOrg });
const tid = String(board.id);

describe("board sharing authz", () => {
  it("owner has owner access; a stranger has none", () => {
    expect(layoutAccess(board.id, owner.id)).toBe("owner");
    expect(layoutAccess(board.id, grantee.id)).toBeNull();
    expect(getReadableLayout(board.id, grantee.id)).toBeUndefined();
  });

  it("a viewer can read but not write", () => {
    const r = createShare(owner.id, "layout", tid, "grantee@example.com", "viewer");
    expect(r.ok).toBe(true);
    expect(layoutAccess(board.id, grantee.id)).toBe("viewer");
    expect(getReadableLayout(board.id, grantee.id)?.id).toBe(board.id);
    expect(getWritableLayout(board.id, grantee.id)).toBeUndefined();
  });

  it("promoting to editor grants write", () => {
    const r = createShare(owner.id, "layout", tid, "grantee@example.com", "editor"); // upsert
    expect(r.ok).toBe(true);
    expect(getWritableLayout(board.id, grantee.id)?.id).toBe(board.id);
  });

  it("rejects self-share, unknown email, and non-owner", () => {
    expect(createShare(owner.id, "layout", tid, "owner@example.com", "viewer")).toMatchObject({ ok: false, error: "self" });
    expect(createShare(owner.id, "layout", tid, "nobody@example.com", "viewer")).toMatchObject({ ok: false, error: "no_user" });
    expect(createShare(stranger.id, "layout", tid, "grantee@example.com", "viewer")).toMatchObject({ ok: false, error: "not_owner" });
  });

  it("lists boards shared with the grantee, and revoke removes access", () => {
    expect(sharedLayouts(grantee.id).map((s) => s.layout.id)).toContain(board.id);
    const share = createShare(owner.id, "layout", tid, "grantee@example.com", "viewer");
    if (!share.ok) throw new Error("setup");
    expect(revokeShare(share.share.id, owner.id)).toBe(true);
    expect(layoutAccess(board.id, grantee.id)).toBeNull();
    expect(sharedLayouts(grantee.id)).toHaveLength(0);
  });

  it("updateShareAccess only works for the owner", () => {
    const s = createShare(owner.id, "layout", tid, "grantee@example.com", "viewer");
    if (!s.ok) throw new Error("setup");
    expect(updateShareAccess(s.share.id, stranger.id, "editor")).toBe(false);
    expect(updateShareAccess(s.share.id, owner.id, "editor")).toBe(true);
  });
});
