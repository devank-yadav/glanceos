import { describe, expect, it } from "vitest";
import { CSV_MAX_ROWS, parseCsv } from "./csvparse";
import { PROVIDERS } from "./providers/registry";

describe("#29 parseCsv", () => {
  it("parses a plain comma file, coercing numeric cells", () => {
    const p = parseCsv("name,score\nAda,95\nGrace, 88\nAlan,hi");
    expect(p.columns).toEqual(["name", "score"]);
    expect(p.rows).toEqual([
      { name: "Ada", score: 95 },
      { name: "Grace", score: 88 },
      { name: "Alan", score: "hi" },
    ]);
    expect(p.truncated).toBe(false);
  });

  it("handles quoted fields, embedded delimiters/newlines, and escaped quotes", () => {
    const p = parseCsv('title,note\n"Hello, world","line one\nline two"\n"She said ""hi""",ok');
    expect(p.rows[0]).toEqual({ title: "Hello, world", note: "line one\nline two" });
    expect(p.rows[1]!.title).toBe('She said "hi"');
  });

  it("sniffs semicolon and tab delimiters from the header", () => {
    expect(parseCsv("a;b\n1;2").rows[0]).toEqual({ a: 1, b: 2 });
    expect(parseCsv("a\tb\n1\t2").rows[0]).toEqual({ a: 1, b: 2 });
  });

  it("names blank headers colN and dedupes duplicates", () => {
    const p = parseCsv(",x,x\n1,2,3");
    expect(p.columns).toEqual(["col1", "x", "x_2"]);
  });

  it("caps rows and reports truncation; blank lines and CRLF are tolerated", () => {
    const big = "n\n" + Array.from({ length: CSV_MAX_ROWS + 50 }, (_, i) => String(i)).join("\n");
    const p = parseCsv(big);
    expect(p.rows.length).toBe(CSV_MAX_ROWS);
    expect(p.truncated).toBe(true);
    expect(parseCsv("a,b\r\n\r\n1,2\r\n").rows).toEqual([{ a: 1, b: 2 }]);
  });
});

describe("#29 csv provider resolve (a lookup, not a fetch)", () => {
  const config = { columns: ["city", "aqi"], rows: [{ city: "Delhi", aqi: 180 }, { city: "Pune", aqi: 95 }] };
  const csv = PROVIDERS.get("csv")!;

  it("csv.rows yields list-friendly items (title = first column, value = first numeric)", async () => {
    const r = (await csv.resolve({ resource: "csv.rows", query: {}, secret: null, config })) as { items: { title: string; value: unknown }[]; rowCount: number };
    expect(r.rowCount).toBe(2);
    expect(r.items[0]).toMatchObject({ title: "Delhi", value: 180, city: "Delhi", aqi: 180 });
  });

  it("csv.column picks the asked column, else the first numeric one", async () => {
    const asked = (await csv.resolve({ resource: "csv.column", query: { column: "aqi" }, secret: null, config })) as { values: number[] };
    expect(asked.values).toEqual([180, 95]);
    const auto = (await csv.resolve({ resource: "csv.column", query: {}, secret: null, config })) as { column: string; values: number[] };
    expect(auto.column).toBe("aqi"); // "city" holds no numbers
    expect(auto.values).toEqual([180, 95]);
  });

  it("an empty/absent table resolves to empty shapes, never throws", async () => {
    const r = (await csv.resolve({ resource: "csv.rows", query: {}, secret: null, config: {} })) as { items: unknown[] };
    expect(r.items).toEqual([]);
  });
});
