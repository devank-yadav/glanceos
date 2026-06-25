// Regenerate the docs/INTEGRATIONS.md catalog straight from the registry source,
// so the doc can never drift from what actually ships. Parses registry.ts by
// regex (no execution): each provider's id/label/category/authKind sit on one
// line; resources follow as { id, label, shape }. Run from apps/server:
//   node scripts/gen-integrations-doc.mjs           (dry run: prints count)
//   node scripts/gen-integrations-doc.mjs --write   (rewrites the doc catalog)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const REG = path.join(ROOT, "apps/server/src/providers/registry.ts");
const DOC = path.join(ROOT, "docs/INTEGRATIONS.md");

const src = fs.readFileSync(REG, "utf8");
const blocks = src.split(/\nreg\(\{/).slice(1); // each provider block

const byId = new Map(); // dedupe by id (last reg() wins, like the Map)
for (const b of blocks) {
  const head = b.match(/id: "([^"]+)", label: "([^"]+)", category: "([^"]+)", authKind: "([^"]+)"/);
  if (!head) continue;
  const [, id, label, category, authKind] = head;
  const resources = [...b.matchAll(/\{ id: "([^"]+)", label: "[^"]*", shape: "[^"]*" \}/g)].map((m) => m[1]);
  // fallback: multi-line resource entries
  if (resources.length === 0) {
    for (const m of b.matchAll(/id: "([^"]+)", label: "[^"]*", shape:/g)) {
      if (m[1] !== id) resources.push(m[1]);
    }
  }
  byId.set(id, { id, label, category, authKind, resources });
}

const AUTH = { none: "keyless", url: "url", token: "token", apiKey: "apiKey", oauth2: "OAuth" };
const TITLES = {
  tasks: "Tasks", issues: "Issues", docs: "Docs & sheets", dev: "Developer", ops: "Observability",
  calendar: "Calendar", mail: "Mail", "smart-home": "Smart home", media: "Media", social: "Social",
  gaming: "Gaming", sports: "Sports", books: "Books", finance: "Finance", money: "Money",
  analytics: "Analytics", health: "Health", "time-tracking": "Time tracking", bookmarks: "Bookmarks",
  civic: "Civic", science: "Science", place: "Travel & place", weather: "Weather", news: "News",
  food: "Food & drink", art: "Art", space: "Space", reference: "Reference", fun: "Fun",
  chat: "Chat", generic: "Generic",
};
const ORDER = ["tasks", "issues", "docs", "dev", "ops", "calendar", "mail", "smart-home", "chat",
  "media", "social", "news", "gaming", "sports", "books", "reference", "science", "space", "weather",
  "place", "food", "art", "fun", "finance", "money", "analytics", "health", "time-tracking",
  "bookmarks", "civic", "generic"];

const groups = new Map();
for (const p of byId.values()) (groups.get(p.category) ?? groups.set(p.category, []).get(p.category)).push(p);
const cats = [...groups.keys()].sort((a, b) => {
  const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
});

const total = byId.size;
let cat = "## Catalog\n";
for (const c of cats) {
  const ps = groups.get(c).sort((a, b) => a.label.localeCompare(b.label));
  cat += `\n### ${TITLES[c] ?? c[0].toUpperCase() + c.slice(1)} (${ps.length})\n`;
  for (const p of ps) {
    cat += `- **${p.label}** \`${p.id}\` · ${AUTH[p.authKind] ?? p.authKind} · ${p.resources.join(", ")}\n`;
  }
}

const keylessCount = [...byId.values()].filter((p) => p.authKind === "none").length;

if (process.argv.includes("--write")) {
  let doc = fs.readFileSync(DOC, "utf8");
  // 1) headline count
  doc = doc.replace(/connects to \*\*\d+ data sources\*\*/, `connects to **${total} data sources**`);
  // 2) replace everything from "## Catalog" to EOF with the generated catalog
  const idx = doc.indexOf("## Catalog");
  if (idx < 0) throw new Error("no ## Catalog anchor");
  doc = doc.slice(0, idx) + cat;
  fs.writeFileSync(DOC, doc);
  console.log(`wrote ${DOC}: ${total} providers (${keylessCount} keyless) across ${cats.length} categories`);
} else {
  console.log(`DRY: ${total} providers (${keylessCount} keyless) across ${cats.length} categories`);
  console.log("categories:", cats.map((c) => `${c}:${groups.get(c).length}`).join(" "));
}
