// First-run gate: show the wizard only on a truly fresh account (no boards AND
// no screens) that hasn't dismissed it. Pure so it's unit-tested.
export const DISMISS_KEY = "glanceos.onboarded";

export function needsOnboarding(opts: { deviceCount: number; layoutCount: number; dismissed: boolean }): boolean {
  return !opts.dismissed && opts.deviceCount === 0 && opts.layoutCount === 0;
}
