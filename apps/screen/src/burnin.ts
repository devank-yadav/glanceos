// Burn-in mitigation for always-on panels: a slow pixel-shift so no pixel stays
// lit in one place. Only used in TV mode (gated by the device's burnIn.pixelShift).

const SHIFTS: Array<[number, number]> = [[0, 0], [3, 0], [3, 3], [0, 3], [-3, 3], [-3, 0], [-3, -3], [0, -3], [3, -3]];

/** Pure: the px offset for a given tick, cycling a small diamond. */
export function shiftOffset(tick: number): { dx: number; dy: number } {
  const i = ((tick % SHIFTS.length) + SHIFTS.length) % SHIFTS.length;
  return { dx: SHIFTS[i]![0], dy: SHIFTS[i]![1] };
}

let timer: ReturnType<typeof setInterval> | null = null;
let tick = 0;

/** Start nudging `el` every 5 min (idempotent). */
export function startPixelShift(el: HTMLElement): void {
  if (timer) return;
  timer = setInterval(() => {
    tick++;
    const { dx, dy } = shiftOffset(tick);
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  }, 5 * 60 * 1000);
}

/** Stop the pixel-shift and reset the transform. */
export function stopPixelShift(el: HTMLElement): void {
  if (timer) { clearInterval(timer); timer = null; }
  el.style.transform = "";
}
