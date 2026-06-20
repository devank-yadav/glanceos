import type { JSX } from "preact";
import type { WidgetType } from "./blocks";

// A bespoke monochrome icon per block type — the palette, slash menu and the
// landing block-wall render these instead of emoji/typographic glyphs. Same
// dependency-free, Feather-style contract as icons.tsx: viewBox 0 0 24 24,
// stroke=currentColor, stroke-width 1.7, round caps — so the whole set is
// visually coherent. Lives in its own module (the editor + landing import it),
// kept out of icons.tsx so the eager chrome set stays small.

type P = { class?: string };
type IconComp = (p: P) => JSX.Element;

const svg = (children: JSX.Element | JSX.Element[]): IconComp =>
  ({ class: c }: P) => (
    <svg class={c} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {children}
    </svg>
  );

// Generic "block" mark — any type without a bespoke icon yet falls back to this,
// so the UI never breaks while the full set is filled in.
const FALLBACK = svg([<rect x="4" y="5" width="16" height="14" rx="2" />, <path d="M8 10h8M8 14h5" />]);

// House-style exemplars spanning the visual vocabulary (lines, shapes, charts,
// faces). The remaining block types are authored to match this style.
export const BLOCK_ICONS: Partial<Record<WidgetType, IconComp>> = {
  text: svg([<path d="M5 7h14" />, <path d="M5 12h14" />, <path d="M5 17h9" />]),
  heading: svg([<path d="M6 6v12" />, <path d="M18 6v12" />, <path d="M6 12h12" />]),
  bulletList: svg([<circle cx="5" cy="7" r="1.1" fill="currentColor" stroke="none" />, <circle cx="5" cy="12" r="1.1" fill="currentColor" stroke="none" />, <circle cx="5" cy="17" r="1.1" fill="currentColor" stroke="none" />, <path d="M9 7h11M9 12h11M9 17h7" />]),
  divider: svg(<path d="M4 12h16" />),
  table: svg([<rect x="3" y="5" width="18" height="14" rx="1.5" />, <path d="M3 10h18M3 14.5h18M9 5v14M15 5v14" />]),
  clock: svg([<circle cx="12" cy="12" r="8" />, <path d="M12 8v4l3 2" />]),
  image: svg([<rect x="3" y="5" width="18" height="14" rx="2" />, <circle cx="8.5" cy="10" r="1.6" />, <path d="m4 17 5-4 4 3 3-2 5 4" />]),
  barChart: svg([<path d="M5 5v14h14" />, <rect x="8" y="12" width="2.6" height="5" fill="currentColor" stroke="none" />, <rect x="12.5" y="9" width="2.6" height="8" fill="currentColor" stroke="none" />, <rect x="17" y="14" width="2.6" height="3" fill="currentColor" stroke="none" />]),
};

/** The icon component for a block type (falls back to a generic block mark). */
export function BlockIcon({ type, class: c }: { type: WidgetType; class?: string }): JSX.Element {
  const Comp = BLOCK_ICONS[type] ?? FALLBACK;
  return <Comp class={c} />;
}
