import { useState } from "preact/hooks";
import { api } from "../api";
import { ClaimForm } from "../components/ClaimForm";
import { Icon } from "../editor/icons";
import { DISMISS_KEY } from "../onboarding";
import { navigate } from "../router";
import { STARTER_CATEGORIES, STARTER_TEMPLATES } from "../starterTemplates";

// First-run welcome: instead of an empty Screens page, ask "what's this screen
// for?" and hand back a finished, pre-themed board in one click. Each vibe maps to
// a starter-template category; we open the first design in that category in Studio.
type Category = (typeof STARTER_CATEGORIES)[number];
const VIBES: { category: Category; label: string; blurb: string }[] = [
  { category: "Time", label: "A beautiful clock", blurb: "Time, date, a calm focal point" },
  { category: "Weather & nature", label: "Weather & sky", blurb: "Forecast, sun, the day ahead" },
  { category: "Wellness & ambient", label: "Calm & ambient", blurb: "A quiet, restful screen" },
  { category: "Team & productivity", label: "Team & tasks", blurb: "Standups, to-dos, focus" },
  { category: "Stats & dashboard", label: "Stats dashboard", blurb: "Numbers, KPIs, status" },
  { category: "Smart home", label: "Smart home", blurb: "Rooms, sensors, presence" },
  { category: "Lobby & welcome", label: "Lobby welcome", blurb: "Greet people at the door" },
  { category: "Menu & retail", label: "Menu / retail", blurb: "Prices, specials, signage" },
  { category: "Events & signage", label: "Events & signage", blurb: "Schedules and countdowns" },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ } onDone(); };

  const open = async (name: string, document?: unknown) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post<{ id: number }>("/api/layouts", document ? { name, document } : { name });
      dismiss();
      navigate(`/edit/${r.id}`);
    } catch { setBusy(false); }
  };
  const pickVibe = (category: Category) => {
    const tpl = STARTER_TEMPLATES.find((t) => t.category === category);
    return tpl ? open(tpl.name, tpl.doc) : open("My first board");
  };

  return (
    <main class="onboard-overlay">
      <div class="onboard-card onboard-vibe-card">
        <div class="brand-mark">glanceos</div>
        <h1>What's this screen for?</h1>
        <p class="muted onboard-sub">Pick a starting point — you'll get a finished, editable board. You can change everything later.</p>
        <div class="onboard-vibes">
          {VIBES.map((v) => (
            <button key={v.category} class="vibe-tile" disabled={busy} onClick={() => pickVibe(v.category)}>
              <strong>{v.label}</strong>
              <span class="muted">{v.blurb}</span>
            </button>
          ))}
        </div>
        <div class="onboard-secondary">
          <button class="ghost" disabled={busy} onClick={() => open("My first board")}><Icon.plus /> Start from blank</button>
          <button class="ghost" disabled={busy} onClick={() => { dismiss(); navigate("/hub"); }}><Icon.convert /> Browse all templates</button>
        </div>
        <details class="onboard-claim">
          <summary class="muted">Already have a screen to connect?</summary>
          <p class="muted">Open <code>/screen</code> on any display, then enter its claim code.</p>
          <ClaimForm onClaimed={async () => dismiss()} />
        </details>
        <button class="ghost onboard-skip" onClick={dismiss}>Skip for now</button>
      </div>
    </main>
  );
}
