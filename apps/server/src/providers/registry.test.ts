import { describe, expect, it } from "vitest";
import { AuthError } from "../fetchers/cache";
import { PROVIDERS, slackError, formatTravelTime, gmailUnread, outlookUnread, fitbitSteps } from "./registry";

describe("provider registry", () => {
  it("registers the providers (incl. v5.0 smart-life + B1 keyless integrations)", () => {
    expect(PROVIDERS.size).toBe(31);
    for (const id of ["asana", "jira", "trello", "slack"]) expect(PROVIDERS.has(id)).toBe(true);
    for (const id of ["osrm", "gmail", "outlookmail", "fitbit", "oura"]) expect(PROVIDERS.has(id)).toBe(true);
    // B1 — keyless social/dev/books/gaming/sports
    for (const id of ["reddit", "devto", "lobsters", "npm", "bluesky", "mastodon", "openlibrary", "steam", "thesportsdb"]) expect(PROVIDERS.has(id)).toBe(true);
    expect(PROVIDERS.get("reddit")?.authKind).toBe("none");
    expect(PROVIDERS.get("npm")?.resources[0]?.shape).toBe("scalar");
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
