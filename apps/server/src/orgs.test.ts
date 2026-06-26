import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-orgs-"));
const { migrate } = await import("./db");
migrate();
const { createUser, createSession } = await import("./auth");
const orgs = await import("./orgs");

const alice = createUser("Alice", "alice@x.com", "password123")!;
const bob = createUser("Bob", "bob@x.com", "password123")!;
const carol = createUser("Carol", "carol@x.com", "password123")!;
let team = "";

beforeAll(() => {
  team = orgs.createOrg("Acme", alice.id).id;
});

describe("personal org", () => {
  it("is created on demand and is idempotent, owner role", () => {
    const a = orgs.ensurePersonalOrg(alice.id);
    expect(orgs.ensurePersonalOrg(alice.id)).toBe(a);
    expect(orgs.memberRole(a, alice.id)).toBe("owner");
  });
});

describe("team membership + invites", () => {
  it("createOrg makes the creator the sole owner", () => {
    expect(orgs.memberRole(team, alice.id)).toBe("owner");
    expect(orgs.listMembers(team)).toHaveLength(1);
  });

  it("invite by email → accept adds the member with the invited role", () => {
    const inv = orgs.createInvite(team, "bob@x.com", "editor", alice.id);
    expect(inv.ok).toBe(true);
    const token = (inv as { ok: true; token: string }).token;
    expect(orgs.getInvite(token)?.org.id).toBe(team);
    expect(orgs.acceptInvite(token, bob.id)).toEqual({ ok: true, orgId: team });
    expect(orgs.memberRole(team, bob.id)).toBe("editor");
    expect(orgs.getInvite(token)).toBeNull(); // consumed
  });

  it("rejects inviting an existing member and inviting as owner", () => {
    expect(orgs.createInvite(team, "bob@x.com", "viewer", alice.id)).toEqual({ ok: false, error: "already_member" });
    expect(orgs.createInvite(team, "x@y.com", "owner", alice.id)).toEqual({ ok: false, error: "bad_role" });
  });

  it("listOrgsForUser puts personal first and includes joined teams with the role", () => {
    orgs.ensurePersonalOrg(bob.id);
    const list = orgs.listOrgsForUser(bob.id);
    expect(list[0]!.personal).toBe(true);
    expect(list.some((o) => o.id === team && o.role === "editor")).toBe(true);
  });
});

describe("role + removal guards", () => {
  it("won't demote or remove the last owner", () => {
    expect(orgs.changeRole(team, alice.id, "editor")).toBe("last_owner");
    expect(orgs.removeMember(team, alice.id)).toBe("last_owner");
  });

  it("can transfer ownership, then demote/remove the former owner", () => {
    expect(orgs.changeRole(team, bob.id, "owner")).toBe("ok"); // two owners now
    expect(orgs.changeRole(team, alice.id, "editor")).toBe("ok");
    expect(orgs.removeMember(team, alice.id)).toBe("ok");
    expect(orgs.memberRole(team, alice.id)).toBeNull();
  });
});

describe("resolveOrgForRequest (self-heal)", () => {
  it("falls back to the personal org when the session has no active org", () => {
    const s = createSession(carol.id);
    const personal = orgs.ensurePersonalOrg(carol.id);
    const r = orgs.resolveOrgForRequest(carol.id, s.token);
    expect(r.orgId).toBe(personal);
    expect(r.role).toBe("owner");
    expect(orgs.getSessionActiveOrg(s.token)).toBe(personal); // persisted the heal
  });

  it("heals a stale active org the user no longer belongs to", () => {
    const s = createSession(carol.id);
    orgs.setSessionActiveOrg(s.token, team); // a real org carol is not a member of
    const r = orgs.resolveOrgForRequest(carol.id, s.token);
    expect(r.orgId).toBe(orgs.ensurePersonalOrg(carol.id));
    expect(r.role).toBe("owner");
  });
});
