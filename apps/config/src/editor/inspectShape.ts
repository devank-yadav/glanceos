// v9.8 — data inspector helpers: turn a previewed live payload into clickable
// SourceMap path suggestions for the Studio's Data tab. Pure + unit-tested.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v != null && typeof v === "object" && !Array.isArray(v);

/** Dotted paths (depth ≤ 2) to every array in the payload, with its row count. */
export function arrayPaths(v: unknown, prefix = "", depth = 0, out: { path: string; n: number }[] = []): { path: string; n: number }[] {
  if (depth > 2 || v == null || typeof v !== "object") return out;
  if (Array.isArray(v)) { out.push({ path: prefix, n: v.length }); return out; }
  for (const k of Object.keys(v as Obj)) arrayPaths((v as Obj)[k], prefix ? `${prefix}.${k}` : k, depth + 1, out);
  return out;
}

/** Dotted paths (depth ≤ 3) to every scalar (string/number/bool) leaf. */
export function scalarPaths(v: unknown, prefix = "", depth = 0, out: string[] = []): string[] {
  if (depth > 3 || v == null) return out;
  if (typeof v !== "object") { if (prefix) out.push(prefix); return out; }
  if (Array.isArray(v)) return out;
  for (const k of Object.keys(v as Obj)) scalarPaths((v as Obj)[k], prefix ? `${prefix}.${k}` : k, depth + 1, out);
  return out;
}

/** Scalar keys of the first element of an array (the per-item fields), capped. */
export function itemKeys(arr: unknown): string[] {
  const first = Array.isArray(arr) ? arr[0] : undefined;
  return isObj(first) ? Object.keys(first).filter((k) => typeof first[k] !== "object").slice(0, 12) : [];
}

/** Read a dotted path out of a value (blank path = the value itself). */
export function atPath(v: unknown, path: string): unknown {
  return path ? path.split(".").reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Obj)[k] : undefined), v) : v;
}

// v11 — one-click "Make it live": compose the inspectors above into complete, ready-to-
// apply binding candidates for a sink kind, so a successful Test offers "bind as X" in a
// single click instead of the user hand-typing items + field + transform.
export type Sink = "series" | "list" | "pair" | "scalar";
export interface BindSuggestion { label: string; items?: string; field?: string; labelField?: string; transform: string }

const LABELISH = ["title", "name", "label", "text", "summary", "headline", "subject", "team", "player"];
const VALUEISH = ["value", "count", "total", "amount", "score", "price", "qty", "num", "n", "points", "pct", "percent"];
// Pick the best key: an exact preferred name, else one whose name contains a preferred token.
const pickKey = (keys: string[], prefs: string[]): string | undefined =>
  prefs.find((p) => keys.includes(p)) ?? keys.find((k) => prefs.some((p) => k.toLowerCase().includes(p)));

export function suggestBindings(data: unknown, sink: Sink): BindSuggestion[] {
  if (data == null) return [];
  const out: BindSuggestion[] = [];
  if (sink === "scalar") {
    const paths = scalarPaths(data).slice(0, 30);
    const preferred = paths.filter((p) => VALUEISH.some((v) => p.toLowerCase().includes(v)));
    for (const p of [...new Set([...preferred, ...paths])].slice(0, 4)) out.push({ label: `Value · ${p}`, field: p, transform: "first" });
    const arr = arrayPaths(data).filter((a) => a.path).sort((a, b) => b.n - a.n)[0];
    if (arr) out.push({ label: `Count of ${arr.path} (${arr.n})`, items: arr.path, transform: "count" });
    return out.slice(0, 5);
  }
  for (const a of arrayPaths(data).sort((x, y) => y.n - x.n).slice(0, 3)) {
    const keys = itemKeys(atPath(data, a.path));
    if (!keys.length && sink !== "list") continue;
    const where = a.path || "(root)";
    if (sink === "list") {
      const f = pickKey(keys, LABELISH) ?? keys[0];
      out.push({ label: `List · ${where}${f ? ` → ${f}` : ""} (${a.n})`, items: a.path, field: f, transform: "join" });
    } else if (sink === "series") {
      const f = pickKey(keys, VALUEISH) ?? keys[0];
      out.push({ label: `Series · ${where} → ${f ?? "?"} (${a.n})`, items: a.path, field: f, transform: "series" });
    } else {
      const lf = pickKey(keys, LABELISH) ?? keys[0];
      const vf = pickKey(keys, VALUEISH) ?? keys.find((k) => k !== lf);
      out.push({ label: `Pairs · ${where}: ${lf ?? "?"} → ${vf ?? "?"} (${a.n})`, items: a.path, labelField: lf, field: vf, transform: "none" });
    }
  }
  return out.slice(0, 4);
}
