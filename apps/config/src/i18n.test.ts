import { describe, expect, it } from "vitest";
import { AVAILABLE, t } from "./i18n";

describe("i18n t()", () => {
  it("looks up a known key", () => {
    expect(t("nav.screens")).toBe("Screens");
    expect(t("action.save")).toBe("Save");
  });

  it("interpolates {vars} and leaves unknown placeholders intact", () => {
    expect(t("toast.connected", { name: "Slack" })).toBe("Connected Slack");
    expect(t("toast.restored", { layouts: 3, playlists: 1 })).toBe("Restored 3 board(s), 1 playlist(s)");
    expect(t("toast.connected")).toBe("Connected {name}"); // no vars → placeholder kept
  });

  it("falls back to the key itself when missing", () => {
    expect(t("totally.unknown.key")).toBe("totally.unknown.key");
  });

  it("ships at least English", () => {
    expect(AVAILABLE).toContain("en");
  });
});
