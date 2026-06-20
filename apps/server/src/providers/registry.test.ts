import { describe, expect, it } from "vitest";
import { AuthError } from "../fetchers/cache";
import { PROVIDERS, slackError } from "./registry";

describe("provider registry", () => {
  it("registers the v1.5 providers (17 total)", () => {
    expect(PROVIDERS.size).toBe(17);
    for (const id of ["asana", "jira", "trello", "slack"]) expect(PROVIDERS.has(id)).toBe(true);
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
