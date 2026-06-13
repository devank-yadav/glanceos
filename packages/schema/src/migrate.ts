import { z } from "zod";
import {
  CalendarProps, CalloutProps, ClockProps, DividerProps, HeadingProps, ImageProps,
  Layout, PAGE_UNITS, QueueProps, TasksProps, TextProps, WeatherProps, type LayoutT,
} from "./layout";

// Documents migrate on read so old boards never break:
//   v1 (grid: col/row/span)        → group widgets by grid row, colSpan → width
//   v2 (rows of blocks, no height) → assign row heights (the v3 addition)
//   v3                             → parsed as-is

type LooseBlock = { id: string; type: string; props: unknown; width: number };
type LooseRow = { id: string; blocks: LooseBlock[] };

const DIVIDER_UNITS = 1;

/** Distribute the 24-unit page across rows; divider-only rows stay thin. */
function withHeights(name: string, theme: unknown, gap: number, rows: LooseRow[]): LayoutT {
  const isDivider = (r: LooseRow) => r.blocks.every((b) => b.type === "divider");
  const thin = rows.filter(isDivider).length;
  const tall = rows.length - thin;
  const tallUnits = Math.max(0, PAGE_UNITS - thin * DIVIDER_UNITS);
  const each = tall > 0 ? Math.max(1, Math.min(12, Math.floor(tallUnits / tall))) : 4;
  return Layout.parse({
    schemaVersion: 3,
    name,
    theme: theme ?? { mode: "light" },
    gap,
    rows: rows.map((r) => ({
      id: r.id,
      h: isDivider(r) ? DIVIDER_UNITS : each,
      blocks: r.blocks,
    })),
  });
}

// ---- v1 (grid) ----

const v1Area = z.object({
  col: z.number().int().min(1),
  row: z.number().int().min(1),
  colSpan: z.number().int().min(1).default(1),
  rowSpan: z.number().int().min(1).default(1),
});
const v1Base = { id: z.string().min(1), area: v1Area };

const LayoutV1 = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  theme: z.object({ mode: z.enum(["light", "dark"]).default("light") }).default({ mode: "light" }),
  grid: z.object({
    columns: z.number().int().min(1).max(12).default(4),
    rows: z.number().int().min(1).max(12).default(3),
    gap: z.number().int().min(0).max(8).default(2),
  }),
  widgets: z.array(
    z.discriminatedUnion("type", [
      z.object({ ...v1Base, type: z.literal("clock"), props: ClockProps }),
      z.object({ ...v1Base, type: z.literal("weather"), props: WeatherProps }),
      z.object({ ...v1Base, type: z.literal("calendar"), props: CalendarProps }),
      z.object({ ...v1Base, type: z.literal("tasks"), props: TasksProps }),
      z.object({ ...v1Base, type: z.literal("text"), props: TextProps }),
      z.object({ ...v1Base, type: z.literal("queue"), props: QueueProps }),
      z.object({ ...v1Base, type: z.literal("heading"), props: HeadingProps }),
      z.object({ ...v1Base, type: z.literal("divider"), props: DividerProps }),
      z.object({ ...v1Base, type: z.literal("image"), props: ImageProps }),
      z.object({ ...v1Base, type: z.literal("callout"), props: CalloutProps }),
    ]),
  ),
});

function fromV1(input: unknown): LayoutT {
  const old = LayoutV1.parse(input);
  const byRow = new Map<number, typeof old.widgets>();
  for (const w of [...old.widgets].sort((a, b) => a.area.row - b.area.row || a.area.col - b.area.col)) {
    const list = byRow.get(w.area.row) ?? [];
    list.push(w);
    byRow.set(w.area.row, list);
  }
  let n = 0;
  const rows: LooseRow[] = [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, widgets]) => ({
      id: `r${++n}`,
      blocks: widgets.map(({ id, type, props, area }) => ({ id, type, props, width: area.colSpan })),
    }));
  return withHeights(old.name, old.theme, old.grid.gap, rows);
}

// ---- v2 (rows of blocks, no height) ----

const LayoutV2 = z.object({
  schemaVersion: z.literal(2),
  name: z.string().min(1),
  theme: z.object({ mode: z.enum(["light", "dark"]).default("light") }).default({ mode: "light" }),
  gap: z.number().int().min(0).max(8).default(2),
  rows: z.array(
    z.object({
      id: z.string().min(1),
      blocks: z.array(z.object({ id: z.string(), type: z.string(), width: z.number().default(1), props: z.unknown() })).min(1),
    }),
  ),
});

function fromV2(input: unknown): LayoutT {
  const old = LayoutV2.parse(input);
  const rows: LooseRow[] = old.rows.map((r) => ({
    id: r.id,
    blocks: r.blocks.map((bl) => ({ id: bl.id, type: bl.type, props: bl.props, width: bl.width })),
  }));
  // Re-validate each block against the current schema by routing through Layout.
  return withHeights(old.name, old.theme, old.gap, rows);
}

/** Parse any stored/imported document, migrating to v3 transparently. */
export function parseDocument(input: unknown): LayoutT {
  const version = (input as { schemaVersion?: unknown })?.schemaVersion;
  if (version === 1) return fromV1(input);
  if (version === 2) return fromV2(input);
  return Layout.parse(input);
}

export function safeParseDocument(
  input: unknown,
): { success: true; data: LayoutT } | { success: false; issues: Array<{ path: Array<string | number>; message: string }> } {
  try {
    return { success: true, data: parseDocument(input) };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { success: false, issues: e.issues.map((i) => ({ path: [...i.path] as Array<string | number>, message: i.message })) };
    }
    return { success: false, issues: [{ path: [], message: String(e instanceof Error ? e.message : e) }] };
  }
}
