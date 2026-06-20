import { describe, expect, it } from "vitest";
import { connectedDeviceIds, deliverLocal, emit, isConnected, setHubBackend, subscribe, type HubBackend } from "./hub";

// hub.test.ts runs as its own module instance (vitest isolates per file), so the
// backend swap below doesn't leak into the rest of the suite.

describe("hub — in-memory backend (default, zero config)", () => {
  it("delivers an emit to a device's subscribers and tracks presence", async () => {
    const got: Array<[string, string]> = [];
    const off = subscribe("dev-1", (event, data) => { got.push([event, data]); });
    expect(isConnected("dev-1")).toBe(true);
    expect(connectedDeviceIds()).toContain("dev-1");

    await emit("dev-1", "state", { hello: "world" });
    expect(got).toEqual([["state", JSON.stringify({ hello: "world" })]]);

    off();
    expect(isConnected("dev-1")).toBe(false);
    expect(connectedDeviceIds()).not.toContain("dev-1");
  });

  it("does not deliver to other devices", async () => {
    let count = 0;
    const off = subscribe("dev-a", () => { count++; });
    await emit("dev-b", "state", {});
    expect(count).toBe(0);
    off();
  });
});

describe("hub — pluggable backend seam", () => {
  it("routes publish/presence through a swapped backend; deliverLocal still reaches local subscribers", async () => {
    const published: Array<{ deviceId: string; event: string; payload: string }> = [];
    const present = new Set(["remote-dev"]);
    const fake: HubBackend = {
      publish: (deviceId, event, payload) => { published.push({ deviceId, event, payload }); },
      onConnect: () => {},
      onDisconnect: () => {},
      isConnected: (id) => present.has(id),
      connectedDeviceIds: () => [...present],
    };
    setHubBackend(fake);

    // emit now goes to the backend (a Redis backend would publish to pub/sub)…
    await emit("x", "state", { a: 1 });
    expect(published).toEqual([{ deviceId: "x", event: "state", payload: JSON.stringify({ a: 1 }) }]);

    // …and presence reflects the backend's view (e.g. a device on another replica).
    expect(isConnected("remote-dev")).toBe(true);
    expect(isConnected("x")).toBe(false);

    // The cross-process receiver hands messages back via deliverLocal → local subs.
    const got: string[] = [];
    const off = subscribe("local-dev", (_e, data) => { got.push(data); });
    await deliverLocal("local-dev", "state", JSON.stringify({ b: 2 }));
    expect(got).toEqual([JSON.stringify({ b: 2 })]);
    off();
  });
});
