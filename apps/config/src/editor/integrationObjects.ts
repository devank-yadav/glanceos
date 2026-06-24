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

  // ---- E1/E2 keyless providers (render immediately, no login) ----
  { providerId: "hackernews", id: "top", label: "Hacker News", description: "Front-page stories", blockType: "bulletList", sourceKind: "hackernews.top", query: { max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 9 },
  { providerId: "wikipedia", id: "onthisday", label: "On this day", description: "Historical events for today", blockType: "bulletList", sourceKind: "wikipedia.onthisday", query: { max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 9 },
  { providerId: "frankfurter", id: "rates", label: "Exchange rates", description: "FX rates from a base currency", blockType: "bulletList", sourceKind: "frankfurter.rates", query: { from: "USD", to: "EUR,GBP,INR,JPY" }, map: LIST({ text: "text", value: "value" }, "items"), defaultH: 7 },
  { providerId: "iss", id: "position", label: "ISS position", description: "Where the space station is now", blockType: "bulletList", sourceKind: "iss.position", query: {}, map: LIST({ text: "text", value: "value" }, "items"), defaultH: 6 },
  { providerId: "spaceflightnews", id: "articles", label: "Spaceflight news", description: "Latest space headlines", blockType: "bulletList", sourceKind: "spaceflightnews.articles", query: { max: "8" }, map: LIST({ text: "title" }, "items"), defaultH: 8 },
  { providerId: "nager", id: "next", label: "Upcoming holidays", description: "Next public holidays for a country", blockType: "bulletList", sourceKind: "nager.next", query: { country: "US", max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 8 },
  { providerId: "gutendex", id: "search", label: "Gutenberg books", description: "Free e-books matching a search", blockType: "bulletList", sourceKind: "gutendex.search", query: { q: "", max: "8" }, map: LIST({ text: "title" }, "items"), defaultH: 8 },
  { providerId: "dictionary", id: "define", label: "Definitions", description: "Definitions of a word", blockType: "bulletList", sourceKind: "dictionary.define", query: { word: "serendipity" }, map: LIST({ text: "title" }, "items"), defaultH: 7 },
  { providerId: "quotable", id: "random", label: "Quotes", description: "Random quotes (optionally by tag)", blockType: "bulletList", sourceKind: "quotable.random", query: { max: "5" }, map: LIST({ text: "title" }, "items"), defaultH: 7 },
  { providerId: "xkcd", id: "latest", label: "Latest xkcd", description: "The newest comic's title", blockType: "stat", sourceKind: "xkcd.latest", query: {}, map: VALUE(), props: { label: "xkcd" }, defaultH: 4 },
  { providerId: "freetogame", id: "games", label: "Free games", description: "Popular free-to-play games", blockType: "bulletList", sourceKind: "freetogame.games", query: { max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 9 },
  { providerId: "binance", id: "tickers", label: "Crypto prices", description: "24h prices for chosen pairs", blockType: "bulletList", sourceKind: "binance.tickers", query: { symbols: "BTCUSDT,ETHUSDT,SOLUSDT" }, map: LIST({ text: "text", value: "value" }, "items"), defaultH: 7 },
  { providerId: "themealdb", id: "search", label: "Recipes", description: "Meals matching a search", blockType: "bulletList", sourceKind: "themealdb.search", query: { q: "chicken", max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 9 },
  { providerId: "thecocktaildb", id: "search", label: "Cocktails", description: "Cocktails matching a search", blockType: "bulletList", sourceKind: "thecocktaildb.search", query: { q: "margarita", max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 9 },
  { providerId: "spacex", id: "upcoming", label: "SpaceX launches", description: "Upcoming SpaceX launches", blockType: "bulletList", sourceKind: "spacex.upcoming", query: { max: "8" }, map: LIST({ text: "title" }, "items"), defaultH: 8 },
  { providerId: "coinpaprika", id: "tickers", label: "Top coins", description: "Top crypto by market cap", blockType: "bulletList", sourceKind: "coinpaprika.tickers", query: { max: "10" }, map: LIST({ text: "text", value: "value" }, "items"), defaultH: 8 },
  { providerId: "artic", id: "artworks", label: "Artworks", description: "Pieces from the Art Institute of Chicago", blockType: "bulletList", sourceKind: "artic.artworks", query: { max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 8 },
  { providerId: "poetrydb", id: "random", label: "A poem", description: "A random poem's lines", blockType: "bulletList", sourceKind: "poetrydb.random", query: {}, map: LIST({ text: "text" }, "items"), defaultH: 9 },
  { providerId: "opentdb", id: "questions", label: "Trivia", description: "Trivia questions", blockType: "bulletList", sourceKind: "opentdb.questions", query: { max: "8" }, map: LIST({ text: "title" }, "items"), defaultH: 9 },
  { providerId: "datamuse", id: "related", label: "Related words", description: "Words related to a word", blockType: "bulletList", sourceKind: "datamuse.related", query: { word: "calm", max: "12" }, map: LIST({ text: "text", value: "value" }, "items"), defaultH: 8 },
  { providerId: "openbrewerydb", id: "byCity", label: "Breweries", description: "Breweries in a city", blockType: "bulletList", sourceKind: "openbrewerydb.byCity", query: { city: "portland", max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 8 },
  { providerId: "f1", id: "next", label: "Next F1 race", description: "The next Formula 1 race", blockType: "bulletList", sourceKind: "f1.next", query: {}, map: LIST({ text: "text", value: "value" }, "items"), defaultH: 6 },

  // ---- E3 keyless providers ----
  { providerId: "nws", id: "alerts", label: "Weather alerts", description: "Active US weather alerts for a state", blockType: "bulletList", sourceKind: "nws.alerts", query: { area: "CA", max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 8 },
  { providerId: "eonet", id: "events", label: "Natural events", description: "Open natural events (wildfires, storms…)", blockType: "bulletList", sourceKind: "eonet.events", query: { max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 8 },
  { providerId: "sunrise", id: "times", label: "Sun times", description: "Sunrise, sunset and day length", blockType: "bulletList", sourceKind: "sunrise.times", query: { lat: "51.5", lng: "-0.12" }, map: LIST({ text: "text", value: "value" }, "items"), defaultH: 6 },
  { providerId: "zippopotam", id: "place", label: "Postcode place", description: "The place for a postal code", blockType: "bulletList", sourceKind: "zippopotam.place", query: { country: "us", code: "10001" }, map: LIST({ text: "title" }, "items"), defaultH: 5 },
  { providerId: "itunes", id: "search", label: "iTunes search", description: "Songs / podcasts / apps", blockType: "bulletList", sourceKind: "itunes.search", query: { q: "daft punk", entity: "song", max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 9 },
  { providerId: "deezer", id: "search", label: "Deezer tracks", description: "Track search", blockType: "bulletList", sourceKind: "deezer.search", query: { q: "lofi", max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 9 },
  { providerId: "musicbrainz", id: "artists", label: "Artist search", description: "Artists from MusicBrainz", blockType: "bulletList", sourceKind: "musicbrainz.artists", query: { q: "", max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 8 },
  { providerId: "pokeapi", id: "list", label: "Pokémon", description: "A list of Pokémon", blockType: "bulletList", sourceKind: "pokeapi.list", query: { max: "20" }, map: LIST({ text: "title" }, "items"), defaultH: 9 },
  { providerId: "scryfall", id: "search", label: "MTG cards", description: "Magic cards matching a query", blockType: "bulletList", sourceKind: "scryfall.search", query: { q: "t:goblin", max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 9 },
  { providerId: "opendota", id: "heroes", label: "Top Dota heroes", description: "Most-picked pro heroes", blockType: "bulletList", sourceKind: "opendota.heroes", query: { max: "10" }, map: LIST({ text: "text", value: "value" }, "items"), defaultH: 8 },
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
