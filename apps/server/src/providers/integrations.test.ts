import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the SSRF-guarded egress so resolve() runs fully offline against canned JSON.
// We keep TTL/AuthError/etc. real and only replace the network functions.
vi.mock("../fetchers/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../fetchers/cache")>();
  return { ...actual, getJSON: vi.fn(), getText: vi.fn(), postJSON: vi.fn() };
});

import { getJSON } from "../fetchers/cache";
import { PROVIDERS, type ResolveCtx } from "./registry";

const mockGet = getJSON as unknown as ReturnType<typeof vi.fn>;
const ctx = (resource: string, query: Record<string, string> = {}, secret: string | null = null): ResolveCtx => ({ resource, query, secret, config: {} });
const run = (id: string, c: ResolveCtx) => PROVIDERS.get(id)!.resolve(c);

describe("keyless integration providers normalize payloads (offline)", () => {
  beforeEach(() => mockGet.mockReset());

  it("reddit.posts → {items:[{title,score,comments,url}]}", async () => {
    mockGet.mockResolvedValue({ data: { children: [{ data: { title: "Hello", score: 42, num_comments: 7, permalink: "/r/x/c/1", subreddit: "x" } }] } });
    const out = (await run("reddit", ctx("reddit.posts", { subreddit: "x" }))) as { items: Record<string, unknown>[] };
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ title: "Hello", score: 42, comments: 7, label: "r/x" });
    expect(String(out.items[0]!.url)).toContain("reddit.com");
  });

  it("npm.downloads → {value}", async () => {
    mockGet.mockResolvedValue({ downloads: 12345 });
    const out = (await run("npm", ctx("npm.downloads", { package: "preact" }))) as { value: number };
    expect(out.value).toBe(12345);
    // no package → null (nothing fetched)
    expect(await run("npm", ctx("npm.downloads", {}))).toBeNull();
  });

  it("coingecko.markets → {items} with price + 24h change", async () => {
    mockGet.mockResolvedValue([{ name: "Bitcoin", symbol: "btc", current_price: 60000, price_change_percentage_24h: 1.5 }]);
    const out = (await run("coingecko", ctx("coingecko.markets", { ids: "bitcoin" }))) as { items: Record<string, unknown>[] };
    expect(out.items[0]).toMatchObject({ title: "Bitcoin", label: "BTC", value: 60000, change: 1.5 });
  });

  it("usgs.quakes → {items} with magnitude + place", async () => {
    mockGet.mockResolvedValue({ features: [{ properties: { place: "10km N of Town", mag: 4.2, time: 1700000000000, url: "https://e.usgs/x" } }] });
    const out = (await run("usgs", ctx("usgs.quakes"))) as { items: Record<string, unknown>[] };
    expect(out.items[0]).toMatchObject({ title: "10km N of Town", value: "M4.2" });
  });

  it("devto.articles → {items} with title + reactions", async () => {
    mockGet.mockResolvedValue([{ title: "TS tips", url: "https://dev.to/x", positive_reactions_count: 9, comments_count: 3, user: { name: "Ada" } }]);
    const out = (await run("devto", ctx("devto.articles"))) as { items: Record<string, unknown>[] };
    expect(out.items[0]).toMatchObject({ title: "TS tips", score: 9, comments: 3, label: "Ada" });
  });

  it("steam.players → {value}; missing appid → null", async () => {
    mockGet.mockResolvedValue({ response: { player_count: 980 } });
    const out = (await run("steam", ctx("steam.players", { appid: "570" }))) as { value: number };
    expect(out.value).toBe(980);
    expect(await run("steam", ctx("steam.players", {}))).toBeNull();
  });

  it("token providers bail to null without a secret (no fetch)", async () => {
    expect(await run("stripe", ctx("stripe.balance"))).toBeNull();
    expect(await run("gitlab", ctx("gitlab.issues"))).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });
});
