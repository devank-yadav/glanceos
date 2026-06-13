import type { JsonFeedDataT } from "@glanceos/schema";
import { cached, FAIL, getText } from "./cache";

// The polling-URL plugin: fetch any JSON, render a template into display lines.
// The template is plain text with {{dotted.path}} tokens (array indices too:
// {{items.0.title}} or {{items[0].title}}). No code runs — only field lookup
// and string interpolation, so it's safe to render on a screen.

function resolvePath(root: unknown, path: string): unknown {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .reduce<unknown>((acc, key) => {
      if (acc == null) return undefined;
      if (Array.isArray(acc)) return acc[Number(key)];
      if (typeof acc === "object") return (acc as Record<string, unknown>)[key];
      return undefined;
    }, root);
}

export function applyTemplate(template: string, data: unknown): string[] {
  return template
    .split(/\r?\n/)
    .map((ln) =>
      ln
        .replace(/\{\{\s*([\w.[\]]+?)\s*\}\}/g, (_, p: string) => {
          const v = resolvePath(data, p);
          if (v == null) return "";
          return typeof v === "object" ? JSON.stringify(v) : String(v);
        })
        .trim(),
    )
    .filter((l) => l.length > 0)
    .slice(0, 12)
    .map((l) => (l.length > 200 ? `${l.slice(0, 197)}…` : l));
}

export function jsonFeedData(props: { url: string; template: string; refreshSeconds: number }): Promise<JsonFeedDataT | null> {
  const ttl = Math.max(30, props.refreshSeconds) * 1000;
  return cached(`json:${props.url}:${props.template}`, ttl, FAIL, async () => {
    const text = await getText(props.url, { accept: "application/json, */*" });
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { lines: [], error: "not JSON" };
    }
    return { lines: applyTemplate(props.template, parsed) };
  });
}
