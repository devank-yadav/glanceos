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
