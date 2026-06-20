import { describe, expect, it, vi } from "vitest";

// Network-free: mock the cache layer so geocodeSearch is exercised without egress.
vi.mock("./cache", () => ({
  cached: async (_k: string, _ttl: number, _fail: number, fn: () => Promise<unknown>) => fn(),
  getJSON: vi.fn(),
  TTL: { h12: 1 },
  FAIL: 1,
}));

import { getJSON } from "./cache";
import { geocodeSearch } from "./geocode";

const mockGet = getJSON as unknown as ReturnType<typeof vi.fn>;

describe("geocodeSearch", () => {
  it("returns [] for short queries without hitting the network", async () => {
    mockGet.mockClear();
    expect(await geocodeSearch("a")).toEqual([]);
    expect(await geocodeSearch("  ")).toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("maps Open-Meteo results to GeoHit shape", async () => {
    mockGet.mockResolvedValueOnce({ results: [{ name: "London", admin1: "England", country: "United Kingdom", latitude: 51.5, longitude: -0.12, population: 9 }] });
    expect(await geocodeSearch("London")).toEqual([
      { name: "London", admin1: "England", country: "United Kingdom", latitude: 51.5, longitude: -0.12 },
    ]);
  });

  it("tolerates a missing results array", async () => {
    mockGet.mockResolvedValueOnce({});
    expect(await geocodeSearch("Nowhereville")).toEqual([]);
  });
});
