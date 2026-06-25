import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { injectAbsoluteOg } from "./ogmeta";

const SHELL = [
  '<meta property="og:type" content="website" />',
  '<meta property="og:title" content="GlanceOS" />',
  '<meta property="og:image" content="/og.png" />',
  '<meta name="twitter:image" content="/og.png" />',
].join("\n    ");

describe("injectAbsoluteOg", () => {
  it("no public URL → unchanged", () => {
    expect(injectAbsoluteOg(SHELL, "")).toBe(SHELL);
  });

  it("makes og:image and twitter:image absolute and adds og:url", () => {
    const out = injectAbsoluteOg(SHELL, "https://glance.example");
    expect(out).toContain('content="https://glance.example/og.png"');
    expect(out).not.toContain('content="/og.png"');
    expect(out).toContain('<meta property="og:url" content="https://glance.example/" />');
    // both image tags rewritten
    expect((out.match(/glance\.example\/og\.png/g) ?? []).length).toBe(2);
  });

  it("strips a trailing slash on the base URL (no double slash)", () => {
    const out = injectAbsoluteOg(SHELL, "https://glance.example/");
    expect(out).toContain('content="https://glance.example/og.png"');
    expect(out).not.toContain("example//og.png");
  });

  it("leaves already-absolute image tags untouched", () => {
    const abs = '<meta property="og:type" content="website" />\n<meta property="og:image" content="https://cdn.example/x.png" />';
    const out = injectAbsoluteOg(abs, "https://glance.example");
    expect(out).toContain('content="https://cdn.example/x.png"');
  });

  it("updates an existing og:url rather than duplicating it", () => {
    const withUrl = SHELL + '\n    <meta property="og:url" content="https://old.example/" />';
    const out = injectAbsoluteOg(withUrl, "https://glance.example");
    expect((out.match(/property="og:url"/g) ?? []).length).toBe(1);
    expect(out).toContain('<meta property="og:url" content="https://glance.example/" />');
    expect(out).not.toContain("old.example");
  });

  // Verify the regex matches the REAL shipped tag format (attribute order/spacing),
  // not just the synthetic fixture above. Skips cleanly when the dist isn't built.
  it("rewrites the actual built config shell when it exists", () => {
    const p = join(import.meta.dirname, "..", "..", "config", "dist", "index.html");
    if (!existsSync(p)) return;
    const out = injectAbsoluteOg(readFileSync(p, "utf8"), "https://glance.example");
    expect(out).toContain('content="https://glance.example/og.png"');
    expect(out).toContain('property="og:url" content="https://glance.example/"');
    expect(out).not.toContain('content="/og.png"');
  });
});
