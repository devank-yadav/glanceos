import { describe, expect, it } from "vitest";
import { AuthError } from "../fetchers/cache";
import { PROVIDERS, slackError, formatTravelTime, gmailUnread, outlookUnread, fitbitSteps } from "./registry";

describe("provider registry", () => {
  it("registers the providers (incl. v5.0 smart-life + B1-B7 integrations)", () => {
    expect(PROVIDERS.size).toBe(153);
    for (const id of ["asana", "jira", "trello", "slack"]) expect(PROVIDERS.has(id)).toBe(true);
    // E1 — more keyless public-data providers
    for (const id of ["hackernews", "wikipedia", "frankfurter", "iss", "spaceflightnews", "nager", "gutendex", "dictionary", "quotable", "xkcd", "freetogame", "binance"]) expect(PROVIDERS.has(id)).toBe(true);
    expect(PROVIDERS.get("hackernews")?.authKind).toBe("none");
    expect(PROVIDERS.get("wikipedia")?.category).toBe("reference");
    expect(PROVIDERS.get("binance")?.category).toBe("finance");
    // E2 — more keyless public-data providers (food/art/space/markets/fun)
    for (const id of ["themealdb", "thecocktaildb", "spacex", "coinpaprika", "artic", "poetrydb", "opentdb", "datamuse", "openbrewerydb", "dadjoke", "f1", "uselessfacts"]) expect(PROVIDERS.has(id)).toBe(true);
    expect(PROVIDERS.get("themealdb")?.category).toBe("food");
    expect(PROVIDERS.get("artic")?.category).toBe("art");
    expect(PROVIDERS.get("spacex")?.authKind).toBe("none");
    // E3 — more keyless providers (weather/science/place/media/gaming/fun)
    for (const id of ["nws", "eonet", "sunrise", "zippopotam", "itunes", "deezer", "musicbrainz", "pokeapi", "scryfall", "opendota", "catfact", "chucknorris"]) expect(PROVIDERS.has(id)).toBe(true);
    expect(PROVIDERS.get("nws")?.category).toBe("weather");
    expect(PROVIDERS.get("eonet")?.category).toBe("science");
    expect(PROVIDERS.get("itunes")?.authKind).toBe("none");
    // E4 — more keyless providers (science/finance/fun/place/weather/gaming/sports/reference)
    for (const id of ["gbif", "openmeteoair", "openmarine", "coinlore", "blockchaininfo", "mempool", "adviceslip", "officialjoke", "affirmations", "worldtime", "civilweather", "cheapshark", "espn", "mlb", "firstorg", "worldbank"]) expect(PROVIDERS.has(id)).toBe(true);
    for (const id of ["gbif", "openmeteoair", "openmarine", "coinlore", "blockchaininfo", "mempool", "adviceslip", "officialjoke", "affirmations", "worldtime", "civilweather", "cheapshark", "espn", "mlb", "firstorg", "worldbank"]) expect(PROVIDERS.get(id)?.authKind).toBe("none");
    expect(PROVIDERS.get("openmeteoair")?.category).toBe("science");
    expect(PROVIDERS.get("coinlore")?.category).toBe("finance");
    expect(PROVIDERS.get("espn")?.category).toBe("sports");
    expect(PROVIDERS.get("civilweather")?.category).toBe("weather");
    // E5 — more keyless providers (flights/transit/weather/energy/museums/sports/food/fun)
    for (const id of ["opensky", "aviationweather", "overpass", "openmeteo", "openmeteoflood", "carbonintensity", "metmuseum", "clevelandart", "vam", "nhl", "openligadb", "openfoodfacts", "fruityvice", "boredapi", "yesno", "kanyerest"]) expect(PROVIDERS.has(id)).toBe(true);
    for (const id of ["opensky", "aviationweather", "overpass", "openmeteo", "openmeteoflood", "carbonintensity", "metmuseum", "clevelandart", "vam", "nhl", "openligadb", "openfoodfacts", "fruityvice", "boredapi", "yesno", "kanyerest"]) expect(PROVIDERS.get(id)?.authKind).toBe("none");
    expect(PROVIDERS.get("openmeteo")?.category).toBe("weather");
    expect(PROVIDERS.get("metmuseum")?.category).toBe("art");
    expect(PROVIDERS.get("nhl")?.category).toBe("sports");
    expect(PROVIDERS.get("openfoodfacts")?.category).toBe("food");
    for (const id of ["osrm", "gmail", "outlookmail", "fitbit", "oura"]) expect(PROVIDERS.has(id)).toBe(true);
    // B1 — keyless social/dev/books/gaming/sports
    for (const id of ["reddit", "devto", "lobsters", "npm", "bluesky", "mastodon", "openlibrary", "steam", "thesportsdb"]) expect(PROVIDERS.has(id)).toBe(true);
    // B2 — keyless civic/finance/media
    for (const id of ["usgs", "diseasesh", "coingecko", "tvmaze", "jikan"]) expect(PROVIDERS.has(id)).toBe(true);
    // B3 — dev/observability token providers
    for (const id of ["gitlab", "bitbucket", "sentry", "vercel", "netlify", "cloudflare", "circleci", "uptimerobot", "statuspage", "betteruptime", "pagerduty"]) expect(PROVIDERS.has(id)).toBe(true);
    expect(PROVIDERS.get("gitlab")?.authKind).toBe("token");
    expect(PROVIDERS.get("uptimerobot")?.authKind).toBe("apiKey");
    expect(PROVIDERS.get("sentry")?.category).toBe("ops");
    expect(PROVIDERS.get("reddit")?.authKind).toBe("none");
    // B4 — productivity / PM / time-tracking / bookmarks token providers
    for (const id of ["clickup", "monday", "height", "shortcut", "harvest", "toggl", "wakatime", "airtable", "pinboard", "raindrop"]) expect(PROVIDERS.has(id)).toBe(true);
    expect(PROVIDERS.get("raindrop")?.category).toBe("bookmarks");
    expect(PROVIDERS.get("toggl")?.category).toBe("time-tracking");
    // B5 — money / analytics token providers
    for (const id of ["stripe", "ynab", "plausible", "umami", "fathom", "posthog", "simpleanalytics", "lemonsqueezy", "paddle", "openexchangerates"]) expect(PROVIDERS.has(id)).toBe(true);
    expect(PROVIDERS.get("stripe")?.category).toBe("money");
    expect(PROVIDERS.get("plausible")?.category).toBe("analytics");
    expect(PROVIDERS.get("openexchangerates")?.authKind).toBe("apiKey");
    // B6 — health / media providers
    for (const id of ["strava", "whoop", "lastfm", "trakt", "listenbrainz", "plex", "tautulli", "sonarr", "radarr"]) expect(PROVIDERS.has(id)).toBe(true);
    expect(PROVIDERS.get("strava")?.authKind).toBe("oauth2");
    expect(PROVIDERS.get("strava")?.oauth?.authorizeUrl).toContain("strava.com");
    expect(PROVIDERS.get("whoop")?.authKind).toBe("oauth2");
    expect(PROVIDERS.get("lastfm")?.authKind).toBe("apiKey");
    // B7 — OAuth scaffold providers (every one carries an oauth spec)
    for (const id of ["discord", "twitch", "dropbox", "calendly", "zoom", "figma", "coinbase", "googletasks", "youtube"]) {
      expect(PROVIDERS.has(id)).toBe(true);
      expect(PROVIDERS.get(id)?.authKind).toBe("oauth2");
      expect(PROVIDERS.get(id)?.oauth?.authorizeUrl).toBeTruthy();
      expect(PROVIDERS.get(id)?.oauth?.tokenUrl).toBeTruthy();
    }
    expect(PROVIDERS.get("zoom")?.oauth?.tokenAuth).toBe("basic");
    expect(PROVIDERS.get("npm")?.resources[0]?.shape).toBe("scalar");
    // every keyless integration provider must require no login
    for (const id of ["reddit", "devto", "lobsters", "npm", "bluesky", "mastodon", "openlibrary", "steam", "thesportsdb", "usgs", "diseasesh", "coingecko", "tvmaze", "jikan"]) {
      expect(PROVIDERS.get(id)?.authKind).toBe("none");
    }
  });

  it("v5.0 smart-life providers carry the right auth + category", () => {
    expect(PROVIDERS.get("osrm")?.authKind).toBe("none"); // keyless
    expect(PROVIDERS.get("osrm")?.category).toBe("place");
    expect(PROVIDERS.get("gmail")?.authKind).toBe("oauth2");
    expect(PROVIDERS.get("gmail")?.oauth?.scopes).toContain("https://www.googleapis.com/auth/gmail.readonly");
    expect(PROVIDERS.get("oura")?.authKind).toBe("token");
    expect(PROVIDERS.get("fitbit")?.oauth?.tokenAuth).toBe("basic");
  });

  it("v5.0 pure mappers shape the raw payloads", () => {
    expect(formatTravelTime({ routes: [{ duration: 540, distance: 4200 }] })).toEqual({ durationMin: 9, distanceKm: 4.2, value: "9 min" });
    expect(formatTravelTime({ routes: [] })).toBeNull();
    expect(gmailUnread({ messagesUnread: 7 }).value).toBe(7);
    expect(gmailUnread(null).value).toBe(0);
    expect(outlookUnread({ unreadItemCount: 3 }).value).toBe(3);
    expect(fitbitSteps({ summary: { steps: 8421 } }).value).toBe(8421);
  });

  it("classifies auth kinds: slack=oauth2, asana/jira/trello=token", () => {
    expect(PROVIDERS.get("slack")?.authKind).toBe("oauth2");
    expect(PROVIDERS.get("slack")?.oauth?.authorizeUrl).toContain("slack.com");
    for (const id of ["asana", "jira", "trello"]) expect(PROVIDERS.get(id)?.authKind).toBe("token");
  });

  it("maps slack auth errors to AuthError (→ needs_auth), others to a plain Error", () => {
    expect(slackError("invalid_auth")).toBeInstanceOf(AuthError);
    expect(slackError("token_revoked")).toBeInstanceOf(AuthError);
    expect(slackError("channel_not_found")).not.toBeInstanceOf(AuthError);
    expect(slackError(undefined).message).toContain("slack");
  });
});
