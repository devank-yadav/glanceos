import { describe, expect, it } from "vitest";
import { describeScope, describeScopes } from "./scopeText";

describe("#170 describeScope (plain words for raw OAuth scopes)", () => {
  it("unwraps Google's URL scopes and reads the access verb", () => {
    expect(describeScope("https://www.googleapis.com/auth/calendar.readonly")).toMatchObject({ label: "Calendar events", readOnly: true });
    expect(describeScope("https://www.googleapis.com/auth/gmail.readonly")).toMatchObject({ label: "Email", readOnly: true });
  });

  it("handles Graph and Slack shapes", () => {
    expect(describeScope("Calendars.Read")).toMatchObject({ label: "Calendar events", readOnly: true });
    expect(describeScope("channels:read")).toMatchObject({ label: "Channels", readOnly: true });
    expect(describeScope("channels:history")).toMatchObject({ label: "Channels history", readOnly: true });
    expect(describeScope("user-read-currently-playing").readOnly).toBe(true);
  });

  it("NEVER claims read-only when it can't prove it — GitHub's `repo` grants writes", () => {
    expect(describeScope("repo")).toMatchObject({ label: "Repositories", readOnly: false });
    expect(describeScope("files.write").readOnly).toBe(false);
    expect(describeScope("something.unfamiliar").readOnly).toBe(false);
  });

  it("names session scopes for what they are, and keeps the raw string for the curious", () => {
    expect(describeScope("offline_access")).toMatchObject({ label: "Stay connected without re-signing in", readOnly: true, raw: "offline_access" });
    expect(describeScope("openid").readOnly).toBe(true);
  });

  it("de-dupes by meaning and sorts session scopes last", () => {
    const list = describeScopes([
      "offline_access",
      "https://www.googleapis.com/auth/calendar.readonly",
      "Calendars.Read", // same thing to a human
      "openid",
    ]);
    expect(list.map((i) => i.label)).toEqual(["Calendar events", "Stay connected without re-signing in", "Confirm who you are"]);
  });

  it("an empty scope list describes nothing (a keyless provider)", () => {
    expect(describeScopes([])).toEqual([]);
  });
});
