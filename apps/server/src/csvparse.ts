// #29 — a tiny RFC-4180-ish CSV parser: quoted fields, escaped quotes (""), CR/LF and
// CRLF row ends, and delimiter sniffing (comma / semicolon / tab, by header counts).
// Pure and dependency-free. Caps keep an enormous file from bloating the connection
// row it's stored in — the parsed table IS the data source (#29 uploads live in the
// connection's config, not on disk).

export const CSV_MAX_ROWS = 2000;
export const CSV_MAX_CHARS = 512_000;

export interface ParsedCsv { columns: string[]; rows: Record<string, string | number>[]; truncated: boolean }

export function parseCsv(text: string): ParsedCsv {
  const clipped = text.length > CSV_MAX_CHARS;
  const t = clipped ? text.slice(0, CSV_MAX_CHARS) : text;
  // Sniff the delimiter on the header line: most hits wins; a tie/none → comma.
  const nl = t.search(/[\r\n]/);
  const head = nl === -1 ? t : t.slice(0, nl);
  const delim = ([",", ";", "\t"] as const).map((d) => [d, head.split(d).length - 1] as const).sort((a, b) => b[1] - a[1])[0]![0];

  const table: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  const endRow = () => {
    cur.push(field); field = "";
    if (cur.length > 1 || cur[0] !== "") table.push(cur); // skip blank lines
    cur = [];
  };
  // Collect up to header + cap + ONE sentinel row — the sentinel is how a capped
  // parse still knows the file had more (truncated) without tokenizing all of it.
  for (let i = 0; i < t.length && table.length <= CSV_MAX_ROWS + 1; i++) {
    const ch = t[i]!;
    if (inQ) {
      if (ch === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { cur.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; endRow(); }
    else field += ch;
  }
  if (field !== "" || cur.length) endRow();

  const header = table.shift() ?? [];
  // Column names: trimmed header cells; blanks become colN; duplicates get _2, _3…
  const seen = new Map<string, number>();
  const columns = header.map((h, i) => {
    const base = h.trim() || `col${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
  const rows = table.slice(0, CSV_MAX_ROWS).map((r) => {
    const o: Record<string, string | number> = {};
    columns.forEach((c, i) => {
      const v = (r[i] ?? "").trim();
      const n = v === "" ? NaN : Number(v);
      o[c] = Number.isFinite(n) ? n : v; // numeric cells become numbers (chartable)
    });
    return o;
  });
  return { columns, rows, truncated: clipped || table.length > CSV_MAX_ROWS };
}
