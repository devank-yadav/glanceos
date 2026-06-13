import { describe, expect, it, vi } from "vitest";
import { currencyData, factData, headlinesData, issData } from "./fetchers/live";
import { forecastData, uvData } from "./fetchers/openmeteo";

// Live blocks must degrade to null (calm placeholder on screen) when the
// network is unavailable — so the studio, fixtures, and CI never depend on it.
describe("live fetchers degrade gracefully offline", () => {
  it("resolve to null when fetch fails, never throw", async () => {
    const original = global.fetch;
    global.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    try {
      await expect(forecastData({ latitude: 11, longitude: 22, days: 3 })).resolves.toBeNull();
      await expect(uvData({ latitude: 11, longitude: 22 })).resolves.toBeNull();
      await expect(currencyData({ from: "AAA", to: "BBB" })).resolves.toBeNull();
      await expect(factData()).resolves.toBeNull();
      await expect(issData()).resolves.toBeNull();
      await expect(headlinesData({ url: "https://example.com/nope.xml", max: 5 })).resolves.toBeNull();
    } finally {
      global.fetch = original;
    }
  });
});
