import type { LayoutT } from "@glanceos/schema";

// #118 — plausible sample data for template previews, so a gallery card shows a LIVING
// wall instead of "weather unavailable" and empty agendas. Pure and deterministic
// (fixed values; event times snap to the next hour) — previews don't flicker between
// renders. Shapes mirror what apps/screen/src/widgets.ts renderers read; a type not
// covered here just keeps its current placeholder (the runtime's paint guard owns it).

type Block = { id: string; type: string; source?: unknown };

const nextHour = (plusH: number): number => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.getTime() + (plusH + 1) * 3_600_000;
};

// Types that render from data even without an explicit source binding.
const ALWAYS_LIVE = new Set(["weather", "calendar", "tasks", "dailyBrief", "queue"]);

function sampleFor(type: string): unknown {
  switch (type) {
    case "weather": return { temperatureC: 21, summary: "Partly cloudy", high: 24, low: 14 };
    case "calendar": return {
      events: [
        { title: "Design review", start: nextHour(0), location: "Room 2" },
        { title: "1:1 with Sam", start: nextHour(3) },
        { title: "Team offsite", start: nextHour(24), allDay: true },
      ],
    };
    case "tasks": return { items: [{ text: "Ship the release notes" }, { text: "Water the plants" }, { text: "Book the dentist" }] };
    case "dailyBrief": return {
      greeting: "Good morning",
      dateLabel: new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }),
      weatherLine: "21° partly cloudy",
      events: [{ time: "09:00", title: "Design review" }, { time: "13:00", title: "1:1 with Sam" }],
      tasks: ["Ship the release notes", "Water the plants"],
    };
    case "queue": return { title: "Now serving", nowServing: 42, waiting: 3 };
    case "headlines": case "hackerNews": return { items: ["Sample headline about a launch", "Another story worth a glance", "The third item on the list"] };
    case "sparkline": case "metricHistory": return [3, 5, 4, 7, 6, 9, 8];
    case "stat": case "metric": case "customData": return 68;
    default: return undefined;
  }
}

/** data[blockId] samples for every block that would otherwise render empty: bound
 *  blocks (they have a source) and the always-live types. Walks rows + pages + zones. */
export function sampleDataFor(doc: LayoutT): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const scan = (rows: { blocks: Block[] }[] | undefined) => {
    for (const row of rows ?? []) {
      for (const b of row.blocks) {
        if (!b.source && !ALWAYS_LIVE.has(b.type)) continue;
        const s = sampleFor(b.type);
        if (s !== undefined) out[b.id] = s;
      }
    }
  };
  const d = doc as LayoutT & { pages?: { blocks: Block[] }[][]; zones?: { rows: { blocks: Block[] }[] }[] };
  scan(d.rows as unknown as { blocks: Block[] }[]);
  if (d.pages) for (const p of d.pages) scan(p);
  if (d.zones) for (const z of d.zones) scan(z.rows);
  return out;
}
