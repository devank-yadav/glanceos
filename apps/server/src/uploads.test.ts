import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-uploads-"));
process.env.GLANCEOS_RATE_LIMIT = "off";
process.env.GLANCEOS_UPLOAD_QUOTA_MB = "0.001"; // ~1048 bytes, so two small images trip the quota
const { migrate, db } = await import("./db");
const { saveUpload, userUsage, gcUploads } = await import("./uploads");
const { buildApp } = await import("./api");
migrate();
const app = buildApp();

// uploads.user_id has an FK to users — create the owners first.
const mkUser = (id: string) => db.prepare("INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(id, id, `${id}@e.test`, "x", 0);
for (const u of ["u1", "u2", "u3"]) mkUser(u);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]); // not a real PNG, just bytes

describe("upload usage + GC", () => {
  it("userUsage sums a user's stored bytes", () => {
    saveUpload("u1", Buffer.concat([PNG, Buffer.alloc(100)]), "image/png");
    saveUpload("u1", Buffer.concat([PNG, Buffer.alloc(50)]), "image/png");
    saveUpload("u2", PNG, "image/png");
    expect(userUsage("u1")).toBe(108 + 58);
    expect(userUsage("u2")).toBe(8);
  });

  it("gc pass 1 deletes on-disk files with no DB row, keeps real ones", () => {
    const dir = join(process.env.GLANCEOS_DATA_DIR!, "uploads");
    writeFileSync(join(dir, "stray-orphan.png"), Buffer.from("junk"));
    const before = userUsage("u1");
    const r = gcUploads();
    expect(r.orphanFiles).toBe(1); // the stray file
    expect(userUsage("u1")).toBe(before); // real uploads untouched
  });

  it("gc pass 2 (opt-in) reclaims rows referenced by no layout", () => {
    const u = saveUpload("u3", PNG, "image/png");
    expect(userUsage("u3")).toBe(8);
    const r = gcUploads({ reclaimUnreferenced: true }); // no layouts reference it
    expect(r.unreferenced).toBeGreaterThanOrEqual(1);
    expect(userUsage("u3")).toBe(0); // row + file gone
    expect(u.url).toContain("/uploads/");
  });

  it("rejects an upload that exceeds the per-user quota with 413", async () => {
    const reg = await app.request("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Q", email: "q@e.test", password: "calm-glass-q" }), headers: { "content-type": "application/json" } });
    const cookie = `glanceos_session=${/glanceos_session=([a-f0-9]+)/.exec(reg.headers.get("set-cookie") ?? "")![1]}`;
    const upload = (n: number) => { const f = new FormData(); f.append("file", new File([new Uint8Array(n)], "i.png", { type: "image/png" })); return app.request("/api/uploads", { method: "POST", body: f, headers: { cookie } }); };
    expect((await upload(600)).status).toBe(201); // first fits (under ~1048)
    expect((await upload(600)).status).toBe(413); // 600 + 600 > quota
  });
});
