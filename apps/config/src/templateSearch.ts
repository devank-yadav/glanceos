// Pure search/filter for the Templates gallery. Kept separate from the
// (auth-gated) component so the matching rules are unit-testable in isolation.
//
// A template matches a query when EVERY whitespace-separated term appears
// somewhere in its name + category + description (case-insensitive). Multiple
// terms therefore narrow the result ("week dark" → boards whose text contains
// both), which is the least-surprising behaviour for a small built-in catalog.

export type SearchableTemplate = { name: string; category: string; description?: string };

export function templateMatches(t: SearchableTemplate, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = `${t.name} ${t.category} ${t.description ?? ""}`.toLowerCase();
  return terms.every((term) => hay.includes(term));
}

// Filter a list by an optional category ("All" = no category filter) AND a free
// text query. Used by the gallery so the chips and the search box compose.
export function filterTemplates<T extends SearchableTemplate>(items: T[], category: string, query: string): T[] {
  const byCat = category === "All" ? items : items.filter((t) => t.category === category);
  const q = query.trim();
  return q ? byCat.filter((t) => templateMatches(t, q)) : byCat;
}
