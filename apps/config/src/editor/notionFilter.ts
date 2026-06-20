// Build a Notion database-query `body` from simple field/operator/value rows.
// Pure (no Preact) so it's unit-tested; the databind UI feeds it rows and drops
// the JSON into the `body` query param. A raw-JSON escape hatch in the params
// textarea always wins, so this is purely a convenience.

export type NotionFilterType = "title" | "rich_text" | "select" | "status" | "checkbox" | "number" | "date";

export interface NotionFilterRow {
  property: string;
  type: NotionFilterType;
  operator: string;
  value: string;
}

export const NOTION_OPERATORS: Record<NotionFilterType, string[]> = {
  title: ["contains", "equals", "does_not_contain"],
  rich_text: ["contains", "equals", "does_not_contain"],
  select: ["equals", "does_not_equal"],
  status: ["equals", "does_not_equal"],
  checkbox: ["equals"],
  number: ["equals", "greater_than", "less_than", "greater_than_or_equal_to", "less_than_or_equal_to"],
  date: ["equals", "on_or_after", "on_or_before", "after", "before"],
};

function coerce(type: NotionFilterType, value: string): string | number | boolean {
  if (type === "checkbox") return value.trim().toLowerCase() === "true";
  if (type === "number") { const n = Number(value); return Number.isFinite(n) ? n : 0; }
  return value;
}

/** One row → a Notion property-filter condition, or null if it has no property. */
export function compileNotionCondition(row: NotionFilterRow): Record<string, unknown> | null {
  if (!row.property.trim()) return null;
  return { property: row.property.trim(), [row.type]: { [row.operator]: coerce(row.type, row.value) } };
}

/** Rows → a Notion query body `{ filter }`, combining many with and/or. {} when empty. */
export function compileNotionFilter(rows: NotionFilterRow[], combinator: "and" | "or" = "and"): Record<string, unknown> {
  const conds = rows.map(compileNotionCondition).filter((c): c is Record<string, unknown> => c !== null);
  if (conds.length === 0) return {};
  if (conds.length === 1) return { filter: conds[0] };
  return { filter: { [combinator]: conds } };
}
