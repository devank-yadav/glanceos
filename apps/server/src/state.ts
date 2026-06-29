import type { StreamPayloadT, TvStateT, WakeWindowT } from "@glanceos/schema";
import { getUser, userHomeGeo } from "./auth";
import { connLookupForOrg } from "./connections";
import { getCustomData } from "./customdata";
import { deviceProfile, devicesOwnedBy, devicesUsingLayout, getDevice, type DeviceRow } from "./devices";
import { activeGroupScheduledLayout, deviceIdsInGroup, getGroupRow } from "./groups";
import { connectedDeviceIds, emit, isConnected } from "./hub";
import { getLayout } from "./layouts";
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
export function currentLayoutId(device: DeviceRow, now = Date.now()): number | null {
  // Wall-clock fallback: screen tz → account default tz → server tz.
  const accountTz = device.user_id ? getUser(device.user_id)?.defaultTimezone ?? null : null;
  const deviceTz = device.timezone ?? accountTz;
  const scheduled = activeScheduledLayout(device.id, now, deviceTz);
  if (scheduled) return scheduled;
  if (device.layout_id) return device.layout_id;

  if (device.group_id) {
    const group = getGroupRow(device.group_id);
    if (group) {
      const tz = device.timezone ?? group.timezone ?? accountTz;
      const gSched = activeGroupScheduledLayout(group.id, now, tz);
      if (gSched) return gSched;
      if (group.layout_id) return group.layout_id;
    }
  }
  return null;
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
  const data = await resolveWidgetData(
    layout.document,
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
      layout: layout.document,
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
