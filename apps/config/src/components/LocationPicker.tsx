import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../api";

// City search → coordinates (+ timezone), or one tap of "Use my location" → the
// browser's coordinates, reverse-geocoded to a real place name. Picking a result
// reports {name, latitude, longitude, timezone?} up to the caller (which persists
// it on the screen or account). Shows the current location with a clear button.

interface GeoHit { name: string; admin1: string | null; country: string | null; latitude: number; longitude: number; timezone: string | null }
export interface ChosenLocation { name: string; latitude: number; longitude: number; timezone?: string | null }

const labelFor = (h: GeoHit): string => [h.name, h.admin1, h.country].filter(Boolean).join(", ");
const browserTz = (): string | null => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } };

// #155 — your recent places: the last few picked locations (this device), shown as one-tap pills
// so setting a second screen to "Kitchen, Delhi" doesn't mean re-searching it.
const RECENTS_KEY = "glanceos.recentLocations";
const loadRecents = (): ChosenLocation[] => { try { const v = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]"); return Array.isArray(v) ? (v as ChosenLocation[]).filter((l) => l && typeof l.name === "string").slice(0, 5) : []; } catch { return []; } };
const saveRecent = (loc: ChosenLocation): ChosenLocation[] => {
  const next = [loc, ...loadRecents().filter((l) => l.name !== loc.name)].slice(0, 5);
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  return next;
};

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
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [recents, setRecents] = useState<ChosenLocation[]>(loadRecents); // #155
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pick = (loc: ChosenLocation) => { setRecents(saveRecent(loc)); onPick(loc); }; // remember, then report up

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
    pick({ name: labelFor(h), latitude: h.latitude, longitude: h.longitude, timezone: h.timezone });
    setQ("");
    setHits([]);
  };

  // One-tap browser geolocation → reverse-geocode for a friendly name; the browser's
  // own timezone rides along so the clock is set too. Coordinates only leave for the
  // SSRF-guarded reverse-geocode lookup.
  const useMyLocation = () => {
    setGeoError("");
    if (!navigator.geolocation) { setGeoError("This browser can't share a location — search a city instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let name = "My location";
        try { name = (await api.get<{ name: string }>(`/api/reverse-geocode?lat=${latitude}&lon=${longitude}`)).name || name; } catch { /* keep fallback */ }
        pick({ name, latitude, longitude, timezone: browserTz() });
        setLocating(false);
      },
      (err) => { setLocating(false); setGeoError(err.code === err.PERMISSION_DENIED ? "Location permission denied — search a city, or allow it in your browser settings." : "Couldn't get your location — search a city instead."); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
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
      <div class="row location-actions" style={{ gap: "8px" }}>
        <input
          type="search"
          placeholder="Search a city…"
          value={q}
          onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
          aria-label="Search for a city"
          class="grow"
        />
        <button class="ghost" disabled={locating} onClick={useMyLocation}>{locating ? "Locating…" : "Use my location"}</button>
      </div>
      {geoError && <p class="muted location-hint" style={{ color: "var(--bad)" }}>{geoError}</p>}
      {recents.length > 0 && !q.trim() && (
        <div class="row wrap location-recents" style={{ gap: "4px", marginTop: "6px" }}>
          {recents.filter((r) => r.name !== current).map((r) => (
            <button key={r.name} class="ghost tiny" title={`Use ${r.name}`} onClick={() => pick(r)}>{r.name}</button>
          ))}
        </div>
      )}
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
