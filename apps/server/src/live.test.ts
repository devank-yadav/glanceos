import { describe, expect, it, vi } from "vitest";

// cache.ts performs egress via undici's fetch (so the SSRF dispatcher can pin
// the resolved IP across redirects). Mock that fetch to simulate "offline".
vi.mock("undici", async (orig) => ({
  ...(await orig<typeof import("undici")>()),
  fetch: vi.fn(() => Promise.reject(new Error("offline"))),
}));

import { currencyData, factData, headlinesData, issData } from "./fetchers/live";
import { forecastData, marineData, pollenData, pollenLevel, uvData } from "./fetchers/openmeteo";

// Live blocks must degrade to null (calm placeholder on screen) when the
// network is unavailable — so the studio, fixtures, and CI never depend on it.
describe("live fetchers degrade gracefully offline", () => {
  it("resolve to null when fetch fails, never throw", async () => {
    await expect(forecastData({ latitude: 11, longitude: 22, days: 3 })).resolves.toBeNull();
    await expect(uvData({ latitude: 11, longitude: 22 })).resolves.toBeNull();
    await expect(pollenData({ latitude: 11, longitude: 22 })).resolves.toBeNull(); // #87
    await expect(marineData({ latitude: 11, longitude: 22 })).resolves.toBeNull(); // #87
    await expect(currencyData({ from: "AAA", to: "BBB" })).resolves.toBeNull();
    await expect(factData()).resolves.toBeNull();
    await expect(issData()).resolves.toBeNull();
    await expect(headlinesData({ url: "https://example.com/nope.xml", max: 5 })).resolves.toBeNull();
  });
});

describe("#87 pollen level bands", () => {
  it("maps grains/m³ to calm levels", () => {
    expect(pollenLevel(5)).toBe("Low");
    expect(pollenLevel(50)).toBe("Moderate");
    expect(pollenLevel(150)).toBe("High");
    expect(pollenLevel(500)).toBe("Very high");
  });
});
