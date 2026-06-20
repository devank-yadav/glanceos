import { useEffect, useState } from "preact/hooks";
import { api } from "../api";

// A searchable timezone <select>, populated once from /api/timezones (the same
// IANA list the server validates against, so it can't offer a rejected zone).
// Empty value = "use the fallback" (server / account default).

let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;
function loadZones(): Promise<string[]> {
  if (cache) return Promise.resolve(cache);
  inflight ??= api.get<string[]>("/api/timezones").then((z) => (cache = z)).catch(() => []);
  return inflight;
}

export function TimezoneSelect({
  value,
  onChange,
  placeholder = "Use default",
}: {
  value: string;
  onChange: (tz: string) => void;
  placeholder?: string;
}) {
  const [zones, setZones] = useState<string[]>(cache ?? []);
  const [filter, setFilter] = useState("");

  useEffect(() => { loadZones().then(setZones); }, []);

  const q = filter.trim().toLowerCase();
  // Always include the current value so a saved zone shows even if filtered out.
  const shown = zones.filter((z) => !q || z.toLowerCase().includes(q));
  const list = value && !shown.includes(value) ? [value, ...shown] : shown;

  return (
    <div class="tz-select">
      <input class="tz-filter" type="text" placeholder="Filter zones…" value={filter} onInput={(e) => setFilter((e.currentTarget as HTMLInputElement).value)} aria-label="Filter timezones" />
      <select value={value} onChange={(e) => onChange((e.currentTarget as HTMLSelectElement).value)}>
        <option value="">{placeholder}</option>
        {list.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
      </select>
    </div>
  );
}
