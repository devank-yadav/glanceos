// #98 — find & replace text across a board. Pure over the doc: walks every block (rows + pages +
// zones), replacing a plain (case-sensitive) substring in the block's visible-text props and its
// name. Structural string props (a URL, a data key, an enum like align/fit) are left alone, so a
// replace can't corrupt bindings. Returns a fresh doc + how many occurrences changed.
import type { LayoutT, RowT, WidgetT } from "@glanceos/schema";

// The props that hold user-authored, on-screen text. Kept as a denylist-free curated set so we
// never touch a source URL, dataKey, automationId, coordinate, or short enum.
const TEXT_KEYS = new Set([
  "content", "text", "label", "title", "heading", "subtitle", "caption", "slides", "message",
  "body", "quote", "author", "prefix", "suffix", "placeholder", "eyebrow", "kicker", "footer", "note", "unit",
]);

function replaceCount(s: string, find: string, repl: string): [string, number] {
  if (!find) return [s, 0];
  const parts = s.split(find);
  return [parts.join(repl), parts.length - 1];
}

/** Replace `find` → `repl` across the board's text; returns the new doc + occurrences changed. */
export function findReplaceInDoc(doc: LayoutT, find: string, repl: string): { doc: LayoutT; count: number } {
  if (!find) return { doc, count: 0 };
  let count = 0;
  const fixBlock = (b: RowT["blocks"][number]): RowT["blocks"][number] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nb: any = { ...b, props: { ...(b as { props: Record<string, unknown> }).props } };
    if (typeof nb.name === "string") { const [v, n] = replaceCount(nb.name, find, repl); nb.name = v; count += n; }
    for (const k of Object.keys(nb.props)) {
      if (TEXT_KEYS.has(k) && typeof nb.props[k] === "string") {
        const [v, n] = replaceCount(nb.props[k] as string, find, repl);
        nb.props[k] = v; count += n;
      }
    }
    return nb as WidgetT;
  };
  const fixRows = (rows: RowT[]): RowT[] => rows.map((r) => ({ ...r, blocks: r.blocks.map(fixBlock) }));
  const out: LayoutT = { ...doc, rows: fixRows(doc.rows) };
  if (doc.pages) out.pages = doc.pages.map(fixRows);
  if (doc.zones) out.zones = doc.zones.map((z) => ({ ...z, rows: fixRows(z.rows) }));
  return { doc: out, count };
}

/** How many occurrences of `find` are in the board's text (no mutation). */
export function countMatches(doc: LayoutT, find: string): number {
  return findReplaceInDoc(doc, find, find).count;
}
