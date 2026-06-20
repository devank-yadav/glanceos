// Compact monochrome SVG glyphs for the screen runtime's computed widgets —
// replacing color emoji that dither badly on e-ink / look inconsistent on TVs.
// Dependency-free SVG strings, currentColor, sized to 1em so they flow with text.
// (Emoji the USER types into a board — callout/emojiStat/flag/mood — stay as
// their content; these only cover values the runtime itself computes.)

const wrap = (inner: string): string =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const r1 = (n: number): string => Math.round(n * 10) / 10 + "";

/** Moon disc with the lit lune filled by illumination (0–100); waxing lights the
 *  right limb, waning the left — the classic single-ellipse terminator trick. */
export function moonGlyph(illumination: number, waxing: boolean): string {
  const r = 9, cx = 12, cy = 12;
  const frac = Math.max(0, Math.min(1, illumination / 100));
  const tx = Math.abs(1 - 2 * frac) * r; // terminator x-radius: 0 at full, r at new
  const limb = waxing ? 0 : 1; // outer lit limb sweep
  const term = frac > 0.5 ? limb : 1 - limb; // gibbous bulges out, crescent curves in
  const lit = `M${cx} ${cy - r}A${r} ${r} 0 0 ${limb} ${cx} ${cy + r}A${r1(tx)} ${r} 0 0 ${term} ${cx} ${cy - r}Z`;
  return wrap(`<circle cx="${cx}" cy="${cy}" r="${r}"/><path d="${lit}" fill="currentColor" stroke="none"/>`);
}

const STAR = "M12 3.5 14.7 9l6 .6-4.5 4.1 1.3 5.9L12 16.7 6.5 19.6l1.3-5.9L3.3 9.6l6-.6z";
export const STAR_FULL = wrap(`<path d="${STAR}" fill="currentColor" stroke="none"/>`);
export const STAR_EMPTY = wrap(`<path d="${STAR}"/>`);

export const CHECK_ON = wrap('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>');
export const CHECK_OFF = wrap('<rect x="4" y="4" width="16" height="16" rx="3"/>');

const SEASON_GLYPHS: Record<string, string> = {
  Winter: '<path d="M12 4v16M5 8l14 8M19 8 5 16"/>',
  Spring: '<path d="M12 21v-7"/><path d="M12 14c-3 0-5-2-5-5 3 0 5 2 5 5z" fill="currentColor" stroke="none"/>',
  Summer: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"/>',
  Autumn: '<path d="M6 18C6 11 11 6 18 6c0 7-5 12-12 12z"/>',
};
export function seasonGlyph(name: string): string {
  return wrap(SEASON_GLYPHS[name] ?? '<circle cx="12" cy="12" r="6"/>');
}

export const stars = (full: number, max: number): string => {
  let s = "";
  for (let i = 0; i < max; i++) s += i < full ? STAR_FULL : STAR_EMPTY;
  return s;
};
