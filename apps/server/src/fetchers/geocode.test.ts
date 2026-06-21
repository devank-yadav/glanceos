import { describe, expect, it, vi } from "vitest";

// Network-free: mock the cache layer so geocodeSearch is exercised without egress.
vi.mock("./cache", () => ({
  cached: async (_k: string, _ttl: number, _fail: number, fn: () => Promise<unknown>) => fn(),
  getJSON: vi.fn(),
  TTL: { h12: 1 },
  FAIL: 1,
}));

import { getJSON } from "./cache";
import { geocodeSearch, reverseGeocode } from "./geocode";

const mockGet = getJSON as unknown as ReturnType<typeof vi.fn>;

describe("geocodeSearch", () => {
  it("returns [] for short queries without hitting the network", async () => {
    mockGet.mockClear();
    expect(await geocodeSearch("a")).toEqual([]);
    expect(await geocodeSearch("  ")).toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("maps Open-Meteo results to GeoHit shape, incl. timezone", async () => {
    mockGet.mockResolvedValueOnce({ results: [{ name: "London", admin1: "England", country: "United Kingdom", latitude: 51.5, longitude: -0.12, timezone: "Europe/London", population: 9 }] });
    expect(await geocodeSearch("London")).toEqual([
      { name: "London", admin1: "England", country: "United Kingdom", latitude: 51.5, longitude: -0.12, timezone: "Europe/London" },
    ]);
  });

  it("defaults timezone to null when Open-Meteo omits it", async () => {
    mockGet.mockResolvedValueOnce({ results: [{ name: "Atlantis", latitude: 0, longitude: 0 }] });
    expect((await geocodeSearch("Atlantis"))[0]!.timezone).toBeNull();
  });

  it("tolerates a missing results array", async () => {
    mockGet.mockResolvedValueOnce({});
    expect(await geocodeSearch("Nowhereville")).toEqual([]);
  });
});

describe("reverseGeocode", () => {
  it("builds a 'City, Country' name from the reverse lookup", async () => {
    mockGet.mockResolvedValueOnce({ city: "Tokyo", principalSubdivision: "Tokyo", countryName: "Japan" });
    expect(await reverseGeocode(35.68, 139.69)).toEqual({ name: "Tokyo, Japan" });
  });

  it("falls back to 'My location' when no place fields are present", async () => {
    mockGet.mockResolvedValueOnce({});
    expect(await reverseGeocode(1, 2)).toEqual({ name: "My location" });
  });

  it("rejects out-of-range coordinates without hitting the network", async () => {
    mockGet.mockClear();
    expect(await reverseGeocode(200, 0)).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });
});
