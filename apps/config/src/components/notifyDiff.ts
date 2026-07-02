// #45 — which just-arrived notifications deserve a desktop banner. Pure: the bell's
// 30s poll feeds the latest list + the persisted high-water id through here, banners
// only what's genuinely new AND unread, and advances the watermark. A zero watermark
// (first ever look on this device) baselines silently — history is never replayed
// as a burst of banners.
export interface NotifItem { id: number; kind: string; message: string; read: boolean }

export const BANNER_CAP = 3; // at most this many banners per poll; the rest fold into one

export function freshSince(list: NotifItem[], seenMaxId: number): { fresh: NotifItem[]; maxId: number } {
  const maxId = list.reduce((m, n) => Math.max(m, n.id), Math.max(0, seenMaxId));
  if (seenMaxId <= 0) return { fresh: [], maxId }; // baseline only
  const fresh = list.filter((n) => n.id > seenMaxId && !n.read).sort((a, b) => a.id - b.id);
  return { fresh, maxId };
}
