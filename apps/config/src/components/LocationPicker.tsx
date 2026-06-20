import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../api";

// City search → coordinates. Debounced query to /api/geocode; picking a result
// reports {name, latitude, longitude} up to the caller (which persists it on the
// device). Shows the current location with a clear button.

interface GeoHit { name: string; admin1: string | null; country: string | null; latitude: number; longitude: number }
export interface ChosenLocation { name: string; latitude: number; longitude: number }

const labelFor = (h: GeoHit): string => [h.name, h.admin1, h.country].filter(Boolean).join(", ");

export function LocationPicker({
  current,
  onPick,
  onClear,
}: {
  current: string | null;
  onPick: (loc: ChosenLocation) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) { setHits([]); return; }
    setBusy(true);
    timer.current = setTimeout(() => {
      api.get<GeoHit[]>(`/api/geocode?q=${encodeURIComponent(query)}`)
        .then((r) => setHits(r))
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  const choose = (h: GeoHit) => {
    onPick({ name: labelFor(h), latitude: h.latitude, longitude: h.longitude });
    setQ("");
    setHits([]);
  };

  return (
    <div class="location-picker">
      {current ? (
        <div class="row spread location-current">
          <span><strong>{current}</strong></span>
          <button class="ghost" onClick={onClear}>Clear</button>
        </div>
      ) : (
        <p class="muted" style={{ margin: "0 0 6px" }}>No location set — weather &amp; sun blocks use their own coordinates.</p>
      )}
      <input
        type="search"
        placeholder="Search a city…"
        value={q}
        onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
        aria-label="Search for a city"
      />
      {busy && <p class="muted location-hint">Searching…</p>}
      {hits.length > 0 && (
        <ul class="location-results">
          {hits.map((h) => (
            <li key={`${h.latitude},${h.longitude}`}>
              <button class="location-result" onClick={() => choose(h)}>{labelFor(h)}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
