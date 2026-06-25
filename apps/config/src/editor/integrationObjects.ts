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

  // ---- E4 keyless providers (render immediately) ----
  { providerId: "gbif", id: "species", label: "Species search", description: "Biodiversity records matching a name", blockType: "bulletList", sourceKind: "gbif.species", query: { q: "Panthera", max: "12" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "openmeteoair", id: "current", label: "Air quality", description: "Live air quality for a lat/lon", blockType: "bulletList", sourceKind: "openmeteoair.current", query: { lat: "52.52", lon: "13.41" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "openmarine", id: "current", label: "Sea conditions", description: "Live wave & sea data for a lat/lon", blockType: "bulletList", sourceKind: "openmarine.current", query: { lat: "54.54", lon: "10.23" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 6 },
  { providerId: "coinlore", id: "top", label: "Top crypto", description: "Top coins by market cap", blockType: "bulletList", sourceKind: "coinlore.top", query: { max: "10" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "blockchaininfo", id: "btcprice", label: "BTC price", description: "Bitcoin price in USD", blockType: "stat", sourceKind: "blockchaininfo.btcprice", query: {}, map: VALUE(), props: { label: "BTC · USD" }, defaultH: 4 },
  { providerId: "mempool", id: "fastestfee", label: "BTC fee", description: "Recommended fast Bitcoin fee", blockType: "stat", sourceKind: "mempool.fastestfee", query: {}, map: VALUE(), props: { label: "BTC fast fee" }, defaultH: 4 },
  { providerId: "worldtime", id: "now", label: "World time", description: "Current local time in a timezone", blockType: "stat", sourceKind: "worldtime.now", query: { tz: "Europe/London" }, map: VALUE(), props: { label: "local time" }, defaultH: 4 },
  { providerId: "civilweather", id: "daily", label: "Civil forecast", description: "Multi-day forecast for a lat/lon", blockType: "bulletList", sourceKind: "civilweather.daily", query: { lat: "51.5", lon: "-0.12" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "cheapshark", id: "deals", label: "Game deals", description: "PC game deals by savings", blockType: "bulletList", sourceKind: "cheapshark.deals", query: { max: "12", upperPrice: "15" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 9 },
  { providerId: "espn", id: "scoreboard", label: "Live scores", description: "Scores & schedule for a league", blockType: "bulletList", sourceKind: "espn.scoreboard", query: { sport: "basketball", league: "nba", max: "12" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "mlb", id: "schedule", label: "MLB scores", description: "Today's MLB games & scores", blockType: "bulletList", sourceKind: "mlb.schedule", query: { max: "12" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "firstorg", id: "countries", label: "Countries", description: "Countries, optionally by region", blockType: "bulletList", sourceKind: "firstorg.countries", query: { region: "", max: "20" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 9 },
  { providerId: "worldbank", id: "indicator", label: "World Bank", description: "An indicator across countries", blockType: "bulletList", sourceKind: "worldbank.indicator", query: { indicator: "SP.POP.TOTL", year: "2023", max: "20" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 9 },

  // ---- E5 keyless providers (render immediately) ----
  { providerId: "openmeteo", id: "current", label: "Weather now", description: "Current conditions for a lat/lon", blockType: "stat", sourceKind: "openmeteo.current", query: { lat: "51.5072", lon: "-0.1276" }, map: VALUE(), props: { label: "weather now" }, defaultH: 4 },
  { providerId: "aviationweather", id: "metar", label: "Airport METAR", description: "Latest observation for an airport (ICAO)", blockType: "stat", sourceKind: "aviationweather.metar", query: { ids: "KJFK" }, map: VALUE(), props: { label: "METAR" }, defaultH: 4 },
  { providerId: "yesno", id: "answer", label: "Yes / No", description: "A random yes, no or maybe", blockType: "stat", sourceKind: "yesno.answer", query: {}, map: VALUE(), props: { label: "answer" }, defaultH: 4 },
  { providerId: "opensky", id: "states", label: "Aircraft overhead", description: "Live aircraft in a lat/lon box", blockType: "bulletList", sourceKind: "opensky.states", query: { lamin: "45.8", lomin: "5.9", lamax: "47.8", lomax: "10.5", max: "12" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "overpass", id: "stations", label: "Stations nearby", description: "Transit stations around a point", blockType: "bulletList", sourceKind: "overpass.stations", query: { lat: "48.8566", lon: "2.3522", radius: "1500" }, map: LIST({ text: "title" }, "items"), defaultH: 8 },
  { providerId: "openmeteoflood", id: "discharge", label: "River discharge", description: "Flood / river forecast for a lat/lon", blockType: "bulletList", sourceKind: "openmeteoflood.discharge", query: { lat: "51.5072", lon: "-0.1276", days: "7" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "carbonintensity", id: "mix", label: "GB energy mix", description: "Britain's live generation mix", blockType: "bulletList", sourceKind: "carbonintensity.mix", query: {}, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "metmuseum", id: "search", label: "Met collection", description: "Artworks from The Met", blockType: "bulletList", sourceKind: "metmuseum.search", query: { q: "sunflower", max: "8" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "clevelandart", id: "search", label: "Cleveland Museum", description: "Open-access artworks", blockType: "bulletList", sourceKind: "clevelandart.search", query: { q: "landscape", max: "8" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "vam", id: "search", label: "V&A collection", description: "Objects from the V&A", blockType: "bulletList", sourceKind: "vam.search", query: { q: "tiger", max: "8" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "nhl", id: "standings", label: "NHL standings", description: "Current NHL standings", blockType: "bulletList", sourceKind: "nhl.standings", query: { max: "16" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 9 },
  { providerId: "openligadb", id: "table", label: "Bundesliga table", description: "League table (openligadb)", blockType: "bulletList", sourceKind: "openligadb.table", query: { league: "bl1", season: "2025", max: "18" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 9 },
  { providerId: "openfoodfacts", id: "search", label: "Food products", description: "Products matching a search", blockType: "bulletList", sourceKind: "openfoodfacts.search", query: { q: "chocolate", max: "8" }, map: LIST({ text: "title" }, "items"), defaultH: 8 },
  { providerId: "fruityvice", id: "all", label: "Fruit nutrition", description: "Fruits and their calories", blockType: "bulletList", sourceKind: "fruityvice.all", query: { max: "20" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 9 },
  { providerId: "boredapi", id: "activities", label: "Things to do", description: "Activity ideas when bored", blockType: "bulletList", sourceKind: "boredapi.activities", query: { max: "8" }, map: LIST({ text: "title", value: "label" }, "items"), defaultH: 8 },

  // ---- E6 keyless providers (render immediately) ----
  { providerId: "bigdatacloud", id: "place", label: "Where am I", description: "Place name for a lat/lon", blockType: "stat", sourceKind: "bigdatacloud.place", query: { lat: "51.5074", lon: "-0.1278" }, map: VALUE(), props: { label: "location" }, defaultH: 4 },
  { providerId: "noaatides", id: "level", label: "Tide level", description: "Latest water level at a NOAA station", blockType: "stat", sourceKind: "noaatides.level", query: { station: "9414290" }, map: VALUE(), props: { label: "tide" }, defaultH: 4 },
  { providerId: "agify", id: "age", label: "Age guess", description: "Predicted age for a first name", blockType: "stat", sourceKind: "agify.age", query: { name: "michael" }, map: VALUE(), props: { label: "predicted age" }, defaultH: 4 },
  { providerId: "genderize", id: "gender", label: "Gender guess", description: "Predicted gender for a first name", blockType: "stat", sourceKind: "genderize.gender", query: { name: "alex" }, map: VALUE(), props: { label: "predicted gender" }, defaultH: 4 },
  { providerId: "policeuk", id: "street", label: "Crime nearby (UK)", description: "Street-level crimes near a point", blockType: "bulletList", sourceKind: "policeuk.street", query: { lat: "52.6297", lng: "-1.1316", max: "12" }, map: LIST({ text: "title", value: "label" }, "items"), defaultH: 8 },
  { providerId: "fbiwanted", id: "list", label: "FBI Wanted", description: "People on the FBI wanted list", blockType: "bulletList", sourceKind: "fbiwanted.list", query: { max: "10" }, map: LIST({ text: "title" }, "items"), defaultH: 8 },
  { providerId: "ukbills", id: "list", label: "UK bills", description: "Bills before the UK Parliament", blockType: "bulletList", sourceKind: "ukbills.list", query: { max: "12" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "nationalize", id: "countries", label: "Name origins", description: "Likely nationalities for a first name", blockType: "bulletList", sourceKind: "nationalize.countries", query: { name: "sofia" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 6 },
  { providerId: "postcodesio", id: "nearest", label: "Nearby postcodes (UK)", description: "Closest UK postcodes to a point", blockType: "bulletList", sourceKind: "postcodesio.nearest", query: { lat: "51.5074", lon: "-0.1278", max: "8" }, map: LIST({ text: "title" }, "items"), defaultH: 7 },
  { providerId: "usgswater", id: "streamflow", label: "River streamflow", description: "Latest USGS streamflow for a site", blockType: "bulletList", sourceKind: "usgswater.streamflow", query: { sites: "01646500" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 6 },
  { providerId: "citypopulation", id: "cities", label: "City populations", description: "World cities and their populations", blockType: "bulletList", sourceKind: "citypopulation.cities", query: { max: "25" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 9 },

  // ---- E7 keyless providers (render immediately) ----
  { providerId: "astros", id: "people", label: "People in space", description: "Astronauts currently in orbit", blockType: "bulletList", sourceKind: "astros.people", query: {}, map: LIST({ text: "title", value: "label" }, "items"), defaultH: 7 },
  { providerId: "tfl", id: "status", label: "Tube line status", description: "London Underground line status", blockType: "bulletList", sourceKind: "tfl.status", query: { mode: "tube" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "citybikes", id: "networks", label: "Bike-share networks", description: "Bike-share systems worldwide", blockType: "bulletList", sourceKind: "citybikes.networks", query: { max: "20" }, map: LIST({ text: "title", value: "label" }, "items"), defaultH: 9 },
  { providerId: "wikitrends", id: "top", label: "Most-read on Wikipedia", description: "Yesterday's most-viewed articles", blockType: "bulletList", sourceKind: "wikitrends.top", query: { lang: "en", max: "12" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 9 },
  { providerId: "exchangeapi", id: "rates", label: "Exchange rates", description: "Rates from a base currency", blockType: "bulletList", sourceKind: "exchangeapi.rates", query: { base: "usd", targets: "eur,gbp,jpy,inr,btc" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 6 },
  { providerId: "rickandmorty", id: "characters", label: "Rick & Morty characters", description: "Characters, optionally by name", blockType: "bulletList", sourceKind: "rickandmorty.characters", query: { name: "", max: "12" }, map: LIST({ text: "title", value: "value" }, "items"), defaultH: 8 },
  { providerId: "metno", id: "now", label: "Weather now (MET Norway)", description: "Current temperature & wind", blockType: "stat", sourceKind: "metno.now", query: { lat: "51.5074", lon: "-0.1278" }, map: VALUE(), props: { label: "weather" }, defaultH: 4 },
  { providerId: "openfda", id: "recalls", label: "Food recalls (FDA)", description: "Latest US food enforcement actions", blockType: "bulletList", sourceKind: "openfda.recalls", query: { max: "10" }, map: LIST({ text: "title", value: "label" }, "items"), defaultH: 8 },
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
