import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-inlets-"));
process.env.GLANCEOS_RATE_LIMIT = "off";

const { migrate } = await import("./db");
const { buildApp } = await import("./api");
const { createUser } = await import("./auth");
const { createInlet, resolveInlet, verifyInletSignature, routeInlet } = await import("./inlets");
const { listTasks } = await import("./tasks");
const { getCustomData } = await import("./customdata");
const { getQueue } = await import("./queues");

migrate();
const app = buildApp();
const user = createUser("Hookowner", "hooks@example.com", "password123")!;

const post = (secret: string, body: string, headers: Record<string, string> = {}) =>
  app.request(`/api/hooks/${secret}`, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

describe("inlets module", () => {
  it("routes a task-sink payload to the task list", async () => {
    const { inlet } = createInlet(user.id, { name: "Tasks", sinkKind: "task", sinkTarget: "default" });
    const row = resolveInlet(inlet.secret)!;
    await routeInlet(row, { text: "from a hook" });
    expect(listTasks(user.id, "default").some((t) => t.text === "from a hook")).toBe(true);
  });

  it("routes a data-sink payload to custom data", async () => {
    const { inlet } = createInlet(user.id, { name: "Data", sinkKind: "data", sinkTarget: "temp" });
    await routeInlet(resolveInlet(inlet.secret)!, { value: 19.5 });
    expect(getCustomData(user.id, "temp")).toBe(19.5);
  });

  it("routes a queue-sink payload by advancing the queue", async () => {
    const { inlet } = createInlet(user.id, { name: "Q", sinkKind: "queue", sinkTarget: "clinic" });
    await routeInlet(resolveInlet(inlet.secret)!, { delta: 2 });
    expect(getQueue(user.id, "clinic").now_serving).toBe(2);
  });

  it("an unsigned inlet accepts any body; a signed inlet checks the HMAC", () => {
    const unsigned = resolveInlet(createInlet(user.id, { name: "u", sinkKind: "none" }).inlet.secret)!;
    expect(verifyInletSignature(unsigned, "anything", undefined)).toBe(true);

    const { inlet, signingKey } = createInlet(user.id, { name: "s", sinkKind: "none", requireSignature: true });
    expect(signingKey).toMatch(/^[a-f0-9]{64}$/);
    const signed = resolveInlet(inlet.secret)!;
    const raw = JSON.stringify({ x: 1 });
    const good = createHmac("sha256", signingKey!).update(raw, "utf8").digest("hex");
    expect(verifyInletSignature(signed, raw, good)).toBe(true);
    expect(verifyInletSignature(signed, raw, `sha256=${good}`)).toBe(true); // GitHub-style prefix
    expect(verifyInletSignature(signed, raw, "deadbeef")).toBe(false);
    expect(verifyInletSignature(signed, raw, undefined)).toBe(false);
    expect(verifyInletSignature(signed, raw + "tamper", good)).toBe(false);
  });
});

describe("POST /api/hooks/:secret (public, no session/CSRF)", () => {
  it("fires an unsigned inlet and routes to its sink", async () => {
    const { inlet } = createInlet(user.id, { name: "open", sinkKind: "data", sinkTarget: "pulse" });
    const res = await post(inlet.secret, JSON.stringify({ value: "beat" }));
    expect(res.status).toBe(200);
    expect((await res.json()).routed).toBe("data");
    expect(getCustomData(user.id, "pulse")).toBe("beat");
  });

  it("404s an unknown secret and a disabled inlet", async () => {
    expect((await post("nonexistent-secret", "{}")).status).toBe(404);
    const { inlet } = createInlet(user.id, { name: "off", sinkKind: "none" });
    const { updateInlet } = await import("./inlets");
    updateInlet(inlet.id, user.id, { enabled: false });
    expect((await post(inlet.secret, "{}")).status).toBe(404);
  });

  it("routeInlet with fireAutos:false skips automations (HTTP self-call loop guard)", async () => {
    const { createAutomation } = await import("./automations");
    const { getCustomData } = await import("./customdata");
    createAutomation(user.id, { name: "loop", enabled: true, trigger: { kind: "webhook" }, actions: [{ kind: "setData", key: "loopGuard", value: 1 }] });
    const { inlet } = createInlet(user.id, { name: "guard", sinkKind: "none" });
    await routeInlet(resolveInlet(inlet.secret)!, {}, { fireAutos: false });
    expect(getCustomData(user.id, "loopGuard")).toBeUndefined();
    await routeInlet(resolveInlet(inlet.secret)!, {}); // default → fires
    expect(getCustomData(user.id, "loopGuard")).toBe(1);
  });

  it("401s a signed inlet without/with a wrong signature, 200 with the right one", async () => {
    const { inlet, signingKey } = createInlet(user.id, { name: "secure", sinkKind: "data", sinkTarget: "k", requireSignature: true });
    const raw = JSON.stringify({ value: 7 });
    expect((await post(inlet.secret, raw)).status).toBe(401);
    expect((await post(inlet.secret, raw, { "x-signature": "bad" })).status).toBe(401);
    const sig = createHmac("sha256", signingKey!).update(raw, "utf8").digest("hex");
    expect((await post(inlet.secret, raw, { "x-signature": sig })).status).toBe(200);
    expect(getCustomData(user.id, "k")).toBe(7);
  });
});

describe("#30 values sink (one POST, a whole set of data values)", () => {
  it("every key of the posted object lands as custom data (end-to-end via the hook URL)", async () => {
    const { inlet } = createInlet(user.id, { name: "Board push", sinkKind: "values" });
    const res = await post(inlet.secret, JSON.stringify({ temp: 21.5, door: "open", mode: true }));
    expect(res.status).toBe(200);
    expect(getCustomData(user.id, "temp")).toBe(21.5);
    expect(getCustomData(user.id, "door")).toBe("open");
    expect(getCustomData(user.id, "mode")).toBe(true);
  });

  it("accepts a {values: {…}} envelope and caps at the first 32 keys", async () => {
    const { inlet } = createInlet(user.id, { name: "Enveloped", sinkKind: "values" });
    const values = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`v30_${i}`, i]));
    await routeInlet(
      { id: inlet.id, user_id: user.id, name: inlet.name, secret: inlet.secret, hmac_key: null, sink_kind: "values", sink_target: "", enabled: 1, created_at: 0, last_fired: null },
      { values },
      { fireAutos: false },
    );
    expect(getCustomData(user.id, "v30_0")).toBe(0);
    expect(getCustomData(user.id, "v30_31")).toBe(31);
    expect(getCustomData(user.id, "v30_32")).toBeUndefined(); // beyond the cap → dropped
  });

  it("an array or scalar body is not a key map — nothing is written", async () => {
    const { inlet } = createInlet(user.id, { name: "Bad shapes", sinkKind: "values" });
    await post(inlet.secret, JSON.stringify([{ sneak: 1 }]));
    expect(getCustomData(user.id, "0")).toBeUndefined();
    expect(getCustomData(user.id, "sneak")).toBeUndefined();
  });
});

describe("review fix — a rejected write is not a change", () => {
  it("an over-cap value neither lands nor fires its dataChanged rule", async () => {
    const { createAutomation } = await import("./automations");
    const { inlet } = createInlet(user.id, { name: "Reject", sinkKind: "data", sinkTarget: "rejkey" });
    createAutomation(user.id, {
      name: "Watch rejkey", enabled: true, trigger: { kind: "dataChanged", key: "rejkey" },
      actions: [{ kind: "setData", key: "rej_fired", value: "yes" }],
    });
    await post(inlet.secret, JSON.stringify({ value: "x".repeat(300_000) })); // past MAX_VALUE_BYTES
    expect(getCustomData(user.id, "rejkey")).toBeUndefined();
    expect(getCustomData(user.id, "rej_fired")).toBeUndefined();
  });
});
