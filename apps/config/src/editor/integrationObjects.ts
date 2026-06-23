import type { WidgetT } from "@glanceos/schema";
import { makeBlock, type WidgetType } from "./blocks";

// v9.7 — per-integration preset "objects" (TRMNL-style): a one-click, ready-to-insert
// block pre-bound to an integration's data source. ZERO screen-runtime cost — each
// preset is just an existing BINDABLE block (bulletList for lists, stat for scalars)
// plus a `source` ({kind, query, map}); the connection is chosen later in the Data tab.
// Keyless presets render immediately; token/OAuth ones light up once connected.
//
// NOTE: the SourceMap field paths below are best-effort and are live-verified/refined in
// the Integrations-page pass (B9). The structural invariants (real block type, bindable,
// kind prefix === providerId) are enforced by integrationObjects.test.ts.

export interface SourceMapPreset {
  path?: string; // scalar/object path, e.g. "results.visitors.value"
  items?: string; // array path for a list, e.g. "items"
  fields?: Record<string, string>; // per-leaf rename, e.g. { text: "title" }
  transform?: string;
  transformArg?: string;
}

export interface IntegrationObject {
  providerId: string; // matches a server provider id
  id: string; // unique within the provider
  label: string;
  description: string;
  blockType: WidgetType; // an existing BINDABLE block
  sourceKind: string; // provider resource id, e.g. "reddit.posts" (prefix must === providerId)
  query?: Record<string, string>; // a starter query template the user tweaks
  map: SourceMapPreset;
  props?: Record<string, unknown>;
  defaultH: number; // /24
}

// Match the Data tab's own binding contract (databind.tsx build()): a list block
// wants transform "join" (array → newline text via each item's `text` field); a
// scalar block wants a scalar transform ("first" returns the value at the path).
const LIST = (fields: Record<string, string> = { text: "title" }, items = "items"): SourceMapPreset => ({ items, fields, transform: "join" });
const VALUE = (path = "value"): SourceMapPreset => ({ path, transform: "first" });

export const INTEGRATION_OBJECTS: IntegrationObject[] = [
  // ---- keyless (render immediately) ----
  { providerId: "reddit", id: "posts", label: "Subreddit posts", description: "Top posts from a subreddit", blockType: "bulletList", sourceKind: "reddit.posts", query: { subreddit: "popular", sort: "hot", max: "8" }, map: LIST(), defaultH: 8 },
  { providerId: "devto", id: "articles", label: "DEV.to articles", description: "Latest dev articles, optionally by tag", blockType: "bulletList", sourceKind: "devto.articles", query: { tag: "", max: "8" }, map: LIST(), defaultH: 8 },
  { providerId: "lobsters", id: "hottest", label: "Lobsters hottest", description: "Hottest stories on Lobsters", blockType: "bulletList", sourceKind: "lobsters.hottest", query: { max: "8" }, map: LIST(), defaultH: 8 },
  { providerId: "coingecko", id: "prices", label: "Crypto prices", description: "Live prices for chosen coins", blockType: "bulletList", sourceKind: "coingecko.markets", query: { ids: "bitcoin,ethereum,solana", vs: "usd", max: "8" }, map: LIST({ text: "name", value: "value" }), defaultH: 7 },
  { providerId: "coingecko", id: "trending", label: "Trending coins", description: "Today's trending coins", blockType: "bulletList", sourceKind: "coingecko.trending", query: { max: "7" }, map: LIST(), defaultH: 7 },
  { providerId: "usgs", id: "quakes", label: "Recent earthquakes", description: "Latest significant quakes", blockType: "bulletList", sourceKind: "usgs.quakes", query: { minMagnitude: "2.5", max: "8" }, map: LIST({ text: "title", value: "value" }), defaultH: 8 },
  { providerId: "tvmaze", id: "schedule", label: "TV tonight", description: "Today's episodes by country", blockType: "bulletList", sourceKind: "tvmaze.schedule", query: { country: "US", max: "10" }, map: LIST(), defaultH: 9 },
  { providerId: "jikan", id: "top", label: "Top anime", description: "Highest-rated anime", blockType: "bulletList", sourceKind: "jikan.top", query: { max: "10" }, map: LIST(), defaultH: 9 },
  { providerId: "openlibrary", id: "search", label: "Book search", description: "Books matching a query", blockType: "bulletList", sourceKind: "openlibrary.search", query: { q: "", max: "6" }, map: LIST(), defaultH: 7 },
  { providerId: "npm", id: "downloads", label: "Package downloads", description: "Weekly downloads of a package", blockType: "stat", sourceKind: "npm.downloads", query: { package: "preact", period: "last-week" }, map: VALUE(), props: { label: "npm downloads" }, defaultH: 4 },
  { providerId: "bluesky", id: "feed", label: "Bluesky posts", description: "Recent posts by a handle", blockType: "bulletList", sourceKind: "bluesky.feed", query: { handle: "", max: "8" }, map: LIST(), defaultH: 8 },
  { providerId: "bluesky", id: "followers", label: "Bluesky followers", description: "Follower count for a handle", blockType: "stat", sourceKind: "bluesky.profile", query: { handle: "" }, map: VALUE(), props: { label: "followers" }, defaultH: 4 },
  { providerId: "mastodon", id: "timeline", label: "Mastodon timeline", description: "Public timeline of an instance", blockType: "bulletList", sourceKind: "mastodon.timeline", query: { instance: "mastodon.social", max: "8" }, map: LIST(), defaultH: 8 },
  { providerId: "steam", id: "players", label: "Players online", description: "Live player count for a Steam game", blockType: "stat", sourceKind: "steam.players", query: { appid: "" }, map: VALUE(), props: { label: "players online" }, defaultH: 4 },
  { providerId: "thesportsdb", id: "next", label: "Next matches", description: "A team's upcoming fixtures", blockType: "bulletList", sourceKind: "thesportsdb.next", query: { teamId: "", max: "6" }, map: LIST(), defaultH: 7 },

  // ---- token / OAuth (light up once connected; maps refined in B9) ----
  { providerId: "todoist", id: "tasks", label: "Todoist tasks", description: "Your open tasks", blockType: "checklist", sourceKind: "todoist.tasks", query: { filter: "today" }, map: LIST({ text: "content" }, ""), defaultH: 8 },
  { providerId: "github", id: "issues", label: "GitHub issues", description: "Issues from a search", blockType: "bulletList", sourceKind: "github.issues", query: {}, map: LIST({ text: "title" }, "items"), defaultH: 8 },
  { providerId: "gitlab", id: "issues", label: "GitLab issues", description: "Issues assigned to you", blockType: "bulletList", sourceKind: "gitlab.issues", query: { max: "10" }, map: LIST({ text: "title" }, ""), defaultH: 8 },
  { providerId: "linear", id: "issues", label: "Linear issues", description: "Your assigned issues", blockType: "bulletList", sourceKind: "linear.issues", query: {}, map: LIST({ text: "title" }, "items"), defaultH: 8 },
  { providerId: "stripe", id: "balance", label: "Stripe balance", description: "Available account balance", blockType: "stat", sourceKind: "stripe.balance", query: {}, map: VALUE(), props: { label: "available" }, defaultH: 4 },
  { providerId: "plausible", id: "visitors", label: "Visitors (7d)", description: "Unique visitors, last 7 days", blockType: "stat", sourceKind: "plausible.aggregate", query: { site_id: "", period: "7d" }, map: { path: "results.visitors.value", transform: "first" }, props: { label: "visitors · 7d" }, defaultH: 4 },
  { providerId: "strava", id: "activities", label: "Recent activities", description: "Your latest workouts", blockType: "bulletList", sourceKind: "strava.activities", query: { max: "8" }, map: LIST({ text: "name" }, ""), defaultH: 8 },
  { providerId: "lastfm", id: "recent", label: "Recent tracks", description: "What you've been listening to", blockType: "bulletList", sourceKind: "lastfm.recent", query: { user: "", max: "8" }, map: LIST({ text: "name" }, "recenttracks.track"), defaultH: 8 },
  { providerId: "clickup", id: "tasks", label: "ClickUp tasks", description: "Tasks from a list", blockType: "checklist", sourceKind: "clickup.tasks", query: { list_id: "" }, map: LIST({ text: "name" }, "tasks"), defaultH: 8 },
  { providerId: "raindrop", id: "bookmarks", label: "Raindrop bookmarks", description: "Recent saved bookmarks", blockType: "bulletList", sourceKind: "raindrop.bookmarks", query: { collection_id: "0", max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 8 },
];

/** Presets for a given provider id (drives the Integrations page "objects" section). */
export const objectsForProvider = (providerId: string): IntegrationObject[] =>
  INTEGRATION_OBJECTS.filter((o) => o.providerId === providerId);

/** Provider ids that ship at least one preset object. */
export const PROVIDERS_WITH_OBJECTS: string[] = [...new Set(INTEGRATION_OBJECTS.map((o) => o.providerId))];

/**
 * Build the ready-to-paste block for a preset: a valid base block (makeBlock) with
 * the preset's name, merged props, and a fully-formed `source` (kind/query/map).
 * The Integrations page copies this to the Studio clipboard; a schema test asserts
 * every preset yields a block that parses against the Widget union.
 */
export function buildPresetBlock(o: IntegrationObject): WidgetT {
  const base = makeBlock(o.blockType) as unknown as Record<string, unknown>;
  const block: Record<string, unknown> = {
    ...base,
    name: o.label,
    props: { ...((base.props as Record<string, unknown>) ?? {}), ...(o.props ?? {}) },
    source: {
      kind: o.sourceKind,
      query: o.query ?? {},
      map: { path: o.map.path ?? "", items: o.map.items, fields: o.map.fields, transform: o.map.transform ?? "none", transformArg: o.map.transformArg },
    },
  };
  return block as unknown as WidgetT;
}
