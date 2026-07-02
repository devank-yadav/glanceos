import type { LayoutT, RowT, StreamPayloadT, TvStateT, WakeWindowT } from "@glanceos/schema";
import { getUser, userHomeGeo } from "./auth";
import { connLookupForOrg } from "./connections";
import { getCustomData } from "./customdata";
import { applyOverrides, overridesMap } from "./deviceOverrides";
import { deviceProfile, devicesOwnedBy, devicesUsingLayout, getDevice, type DeviceRow } from "./devices";
import { activeGroupScheduledLayout, deviceIdsInGroup, getGroupRow } from "./groups";
import { connectedDeviceIds, emit, isConnected } from "./hub";
import { getLayout, getOwnedLayout } from "./layouts";
import { activeScheduledLayout, hasSchedules, wallClock } from "./schedules";
import { resolveWidgetData } from "./widgets";
import { sunTimes } from "./astro";

// A screen inherits the account home location when it has none of its own, so a
// weather/sun block resolves sensibly even on an unconfigured screen (precedence:
// block geo → screen location → account home → server default).
function geoForDevice(device: DeviceRow): { latitude: number; longitude: number } | undefined {
  if (device.latitude != null && device.longitude != null) return { latitude: device.latitude, longitude: device.longitude };
  const home = device.user_id ? userHomeGeo(device.user_id) : null;
  return home ? { latitude: home.lat, longitude: home.lon } : undefined;
}

/** The layout a device shows right now. The device's own settings win — schedule
 *  → plain setup — then it falls back to its display group's: group schedule →
 *  group default. No group / no group settings → exactly the previous behavior.
 *  (Board rotation now lives inside a board as pages, not as device playlists.) */
// #171 — every rung of the ladder is tagged with WHY it won, and currentLayoutId
// delegates, so the screens audit reads the real resolution — never a parallel copy.
export type LayoutReason = "lowBattery" | "deviceSchedule" | "deviceBoard" | "homeBoard" | "groupSchedule" | "groupBoard" | "none";
export function resolveLayoutWithReason(device: DeviceRow, now = Date.now()): { layoutId: number | null; reason: LayoutReason } {
  // #58 — battery critically low → swap to the user's designated minimal board so a panel about
  // to die shows a calm low-battery screen instead of dying mid-content. Own-org only (no cross-
  // org leak even if the owner moved orgs or deleted the board). Wins over every normal board.
  const lb = deviceProfile(device).lowBattery;
  if (lb && device.battery != null && device.battery <= lb.pct && getOwnedLayout(lb.layoutId, device.org_id ?? "")) return { layoutId: lb.layoutId, reason: "lowBattery" };
  // Wall-clock fallback: screen tz → account default tz → server tz.
  const accountTz = device.user_id ? getUser(device.user_id)?.defaultTimezone ?? null : null;
  const deviceTz = device.timezone ?? accountTz;
  const scheduled = activeScheduledLayout(device.id, now, deviceTz);
  if (scheduled) return { layoutId: scheduled, reason: "deviceSchedule" };
  if (device.layout_id) return { layoutId: device.layout_id, reason: "deviceBoard" };

  // #147 — a user's personal "home board" shows on any of their own screens that has no board
  // of its own, before the display-group fallback. Re-check org ownership here so the board is
  // only shown when it belongs to THIS screen's org (no cross-org exposure if the owner later
  // moved orgs or the board was deleted).
  if (device.user_id) {
    const homeId = getUser(device.user_id)?.homeLayoutId ?? null;
    if (homeId && getOwnedLayout(homeId, device.org_id ?? "")) return { layoutId: homeId, reason: "homeBoard" };
  }

  if (device.group_id) {
    const group = getGroupRow(device.group_id);
    if (group) {
      const tz = device.timezone ?? group.timezone ?? accountTz;
      const gSched = activeGroupScheduledLayout(group.id, now, tz);
      if (gSched) return { layoutId: gSched, reason: "groupSchedule" };
      if (group.layout_id) return { layoutId: group.layout_id, reason: "groupBoard" };
    }
  }
  return { layoutId: null, reason: "none" };
}
export function currentLayoutId(device: DeviceRow, now = Date.now()): number | null {
  return resolveLayoutWithReason(device, now).layoutId;
}

/** Pure: is the display awake at this wall-clock minute/weekday? Outside the wake
 *  window (or on an inactive day) → "off"; no window → always "on". Handles an
 *  overnight window (start > end). */
// Pure: is this wall-clock minute/weekday inside the window? Handles an overnight
// window (start > end). Shared by the wake window (power) and quiet hours (dim).
export function windowActive(win: WakeWindowT, minute: number, weekday: number): boolean {
  if ((win.daysMask & (1 << weekday)) === 0) return false;
  return win.startMin <= win.endMin
    ? minute >= win.startMin && minute < win.endMin
    : minute >= win.startMin || minute < win.endMin;
}

export function wakePower(wake: WakeWindowT | undefined, minute: number, weekday: number): "on" | "off" {
  if (!wake) return "on";
  return windowActive(wake, minute, weekday) ? "on" : "off";
}

// #80 — server-side mirror of the screen's pageScheduleActive() (apps/screen render.ts), kept in
// sync field-for-field. Used only to fingerprint the e-ink /display ETag: a per-block `schedule`
// is evaluated screen-side, so when a scheduled block flips at a time boundary the layout version
// and resolved data are unchanged and a panel would 304 into a stale frame. The headless e-ink
// render runs on this server, so evaluating with the SAME `now` (server-local) matches what it
// will paint. Web/TV don't need this — they get a fresh composeState push on any change.
type BlockSchedule = NonNullable<RowT["blocks"][number]["schedule"]>;
function scheduleActiveAt(s: BlockSchedule | undefined, now: Date): boolean {
  if (!s) return true;
  if (s.fromDate || s.toDate) {
    const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (s.fromDate && d < s.fromDate) return false;
    if (s.toDate && d > s.toDate) return false;
  }
  if (s.daysMask != null && ((s.daysMask >> now.getDay()) & 1) === 0) return false;
  if (s.startMin != null && s.endMin != null) {
    const t = now.getHours() * 60 + now.getMinutes();
    const inWin = s.startMin <= s.endMin ? t >= s.startMin && t < s.endMin : t >= s.startMin || t < s.endMin;
    if (!inWin) return false;
  }
  return true;
}

/** #80 — a fingerprint of which scheduled blocks are active right now (across rows/pages/zones).
 *  Folded into the e-ink ETag so a panel re-renders at a schedule boundary. "" when the board has
 *  no scheduled blocks (so unscheduled boards' ETags are unaffected). */
export function scheduledSig(doc: LayoutT, now = new Date()): string {
  const parts: string[] = [];
  const scan = (rows: RowT[]) => { for (const r of rows) for (const b of r.blocks) if (b.schedule) parts.push(`${b.id}:${scheduleActiveAt(b.schedule, now) ? 1 : 0}`); };
  scan(doc.rows);
  if (doc.pages) for (const p of doc.pages) scan(p);
  if (doc.zones) for (const z of doc.zones) scan(z.rows);
  return parts.join(",");
}

// The TV settings the screen applies (undefined for non-TV devices), incl. the
// display-power state computed from the wake window in the device's timezone.
export function tvStateFor(device: DeviceRow, now = Date.now()): TvStateT | undefined {
  const p = deviceProfile(device);
  if (!p.tvMode) return undefined;
  let power: "on" | "off" = "on";
  if (p.wake) {
    const { weekday, minute } = wallClock(now, device.timezone);
    power = wakePower(p.wake, minute, weekday);
  }
  return { enabled: true, safeArea: p.safeArea, burnIn: p.burnIn, power };
}

// `commit` (default true) controls whether this compose advances the "since you looked"
// snapshot baseline — true only when the result is actually delivered as a fresh render
// (SSE push, e-ink render.bmp), false for inspection-only composes (the /display ETag
// probe, owner previews) so they don't consume a pending delta before it's shown.
export async function composeState(device: DeviceRow, now = Date.now(), opts: { commit?: boolean } = {}): Promise<StreamPayloadT> {
  if (!device.claimed_at) {
    return { claimed: false, claimCode: device.claim_code ?? "------" };
  }
  const tv = tvStateFor(device, now);
  const layoutId = currentLayoutId(device, now);
  const layout = layoutId ? getLayout(layoutId) : undefined;
  if (!layout) {
    // First-class state: claimed, waiting for the user to pick a setup.
    return {
      claimed: true,
      state: { layoutVersion: 0, layout: null, data: {}, deviceName: device.name ?? undefined, tv },
    };
  }
  // v6.1 presentation hints (resolved server-side so the screen stays dumb):
  // theme "auto" → light by day / dark after sunset at the screen's location; quiet
  // hours → a soft dim. Both degrade gracefully (no geo → light; no window → no dim).
  const profile = deviceProfile(device);
  const geo = geoForDevice(device);
  let effectiveTheme: "light" | "dark" | undefined;
  if (layout.document.theme.mode === "auto") {
    const sun = geo ? sunTimes(new Date(now), geo.latitude, geo.longitude) : null;
    effectiveTheme = sun ? (now >= sun.sunrise.getTime() && now < sun.sunset.getTime() ? "light" : "dark") : "light";
  }
  let quietDim: boolean | undefined;
  if (profile.quietHours) {
    const { weekday, minute } = wallClock(now, device.timezone);
    quietDim = windowActive(profile.quietHours, minute, weekday);
  }
  // #48 — per-device overrides: merge this screen's prop patches into the shared board before
  // resolving data + sending the layout, so one board can show device-specific values (e.g. the
  // kitchen screen's weather block at the kitchen's coordinates). No-op when the device has none.
  const doc = applyOverrides(layout.document, overridesMap(device.id));
  const data = await resolveWidgetData(
    doc,
    device.user_id ?? "",
    connLookupForOrg(device.org_id ?? ""), // a shared board resolves under its org's connections
    geo,
    `dev:${device.id}`, // per-device snapshot key for the "since you looked" digest
    opts.commit ?? true,
  );
  // #149 Focus mode — when the user's `focusMode` data key is on (set by a tap, the API, or an
  // automation during a meeting via calendar.isBusyNow), flag focus active in a reserved data
  // key so the screen hides every block marked `focusHide`. Off by default; costs one cheap read.
  if (device.user_id && focusFlag(getCustomData(device.user_id, "focusMode"))) data["__focus"] = true;
  return {
    claimed: true,
    state: {
      layoutVersion: layout.version,
      layout: doc, // #48 — per-device overrides already merged in
      data,
      deviceName: device.name ?? undefined,
      tv,
      effectiveTheme,
      quietDim,
    },
  };
}

// A focusMode value is "on" for true / 1 / "true" / "on" / "yes" (any case); anything else is off.
function focusFlag(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string") return ["true", "on", "yes", "1"].includes(v.trim().toLowerCase());
  return false;
}

export async function pushDevice(deviceId: string): Promise<void> {
  if (!isConnected(deviceId)) return; // nobody listening — composing would waste fetches
  const device = getDevice(deviceId);
  if (!device) return;
  const payload = await composeState(device);
  const eventId = payload.claimed ? String(payload.state.layoutVersion) : "0";
  await emit(deviceId, "state", payload, eventId);
}

export async function pushDevicesUsingLayout(layoutId: number): Promise<void> {
  const ids = devicesUsingLayout(layoutId).map((d) => d.id);
  await Promise.all(ids.map((id) => pushDevice(id)));
}

// Spread N pushes evenly across `windowMs` so a periodic tick doesn't compose +
// emit to the whole fleet on one timer edge (which spikes DB + SSE at scale).
// windowMs=0 → immediate (on-demand pushes after an edit want no delay).
async function pushSpread(ids: string[], windowMs: number): Promise<void> {
  if (windowMs <= 0 || ids.length <= 1) { await Promise.all(ids.map((id) => pushDevice(id))); return; }
  const step = windowMs / ids.length;
  await Promise.all(ids.map((id, i) => new Promise<void>((resolve) => {
    setTimeout(() => { pushDevice(id).catch(() => {}).finally(resolve); }, Math.floor(i * step));
  })));
}

/** Re-push connected scheduled screens so they flip at window boundaries. */
export async function pushScheduledDevices(staggerMs = 0): Promise<void> {
  const ids = connectedDeviceIds().filter((id) => hasSchedules(id));
  await pushSpread(ids, staggerMs);
}

export async function pushDeviceIds(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => pushDevice(id)));
}

/** Push every connected screen belonging to one user (task/queue changes). */
export async function pushUserDevices(userId: string): Promise<void> {
  await Promise.all(devicesOwnedBy(userId).map((d) => pushDevice(d.id)));
}

/** Re-push every connected screen in a display group (group default/schedule changed). */
export async function pushGroupDevices(groupId: number): Promise<void> {
  await pushDeviceIds(deviceIdsInGroup(groupId));
}

/** Deliver a fleet command (reload/identify/…) to every connected screen in a group.
 *  Returns how many live screens received it. */
export async function emitGroupCommand(groupId: number, command: string, params?: Record<string, unknown>): Promise<number> {
  let delivered = 0;
  for (const id of deviceIdsInGroup(groupId)) {
    if (!isConnected(id)) continue;
    await emit(id, "command", { command, params: params ?? {} });
    delivered++;
  }
  return delivered;
}

export async function pushAllConnected(staggerMs = 0): Promise<void> {
  await pushSpread(connectedDeviceIds(), staggerMs);
}
