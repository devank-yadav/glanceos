// #16 — "held vs instant" as a one-tap idea. The engine has always supported a
// `sustained` node (fire only once the conditions have stayed true for N minutes), but
// applying it meant hand-building a nested node around your condition. These pure
// helpers wrap/unwrap the WHOLE condition tree at the root, so the chip can toggle it.
// Generic over the caller's condition union (the builder's `Cond`): they only ever
// return a node of that same shape, so callers keep their exact type.
interface HoldShape { type: string; conditions?: unknown[]; condition?: unknown; minutes?: number }

/** Is the rule's root a hold? (Only a root-level sustained is chip-toggleable; a hold
 *  nested deeper is the author's own structure and is left exactly as written.) */
export const isHeld = (c: unknown): boolean => !!c && (c as HoldShape).type === "sustained";

/** Wrap the tree in a hold. An empty group has nothing to hold, so it's returned as-is. */
export function hold<T>(c: T | null | undefined, minutes: number): T | null | undefined {
  if (!c) return c;
  const n = c as unknown as HoldShape;
  if (n.type === "sustained") return { ...n, minutes } as T; // already held → just retime
  if ((n.type === "all" || n.type === "any") && !(n.conditions ?? []).length) return c;
  return { type: "sustained", minutes, condition: c } as T;
}

/** Unwrap a root hold, giving back the inner condition untouched. */
export function unhold<T>(c: T | null | undefined): T | null | undefined {
  const n = c as unknown as HoldShape | null | undefined;
  return n && n.type === "sustained" && n.condition ? (n.condition as T) : c;
}
