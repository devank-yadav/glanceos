import type { StreamPayloadT, TvStateT, WakeWindowT } from "@glanceos/schema";
import { connLookupFor } from "./connections";
import { deviceProfile, devicesOwnedBy, devicesUsingLayout, getDevice, type DeviceRow } from "./devices";
import { connectedDeviceIds, emit, isConnected } from "./hub";
import { getLayout } from "./layouts";
import { currentPlaylistLayout } from "./playlists";
import { activeScheduledLayout, hasSchedules, wallClock } from "./schedules";
import { resolveWidgetData } from "./widgets";

/** The layout a device shows right now — an active time-of-day schedule wins,
 *  then its playlist's current item, then its plain setup. */
export function currentLayoutId(device: DeviceRow, now = Date.now()): number | null {
  const scheduled = activeScheduledLayout(device.id, now, device.timezone);
  if (scheduled) return scheduled;
  if (device.playlist_id) return currentPlaylistLayout(device.playlist_id, now);
  return device.layout_id;
}

/** Pure: is the display awake at this wall-clock minute/weekday? Outside the wake
 *  window (or on an inactive day) → "off"; no window → always "on". Handles an
 *  overnight window (start > end). */
export function wakePower(wake: WakeWindowT | undefined, minute: number, weekday: number): "on" | "off" {
  if (!wake) return "on";
  if ((wake.daysMask & (1 << weekday)) === 0) return "off";
  const inWindow = wake.startMin <= wake.endMin
    ? minute >= wake.startMin && minute < wake.endMin
    : minute >= wake.startMin || minute < wake.endMin;
  return inWindow ? "on" : "off";
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

export async function composeState(device: DeviceRow, now = Date.now()): Promise<StreamPayloadT> {
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
  return {
    claimed: true,
    state: {
      layoutVersion: layout.version,
      layout: layout.document,
      data: await resolveWidgetData(layout.document, device.user_id ?? "", connLookupFor(device.user_id ?? "")),
      deviceName: device.name ?? undefined,
      tv,
    },
  };
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
  const direct = devicesUsingLayout(layoutId).map((d) => d.id);
  // a layout edited inside a playlist also affects connected rotating screens
  const ids = new Set([...direct, ...connectedDeviceIds().filter((id) => getDevice(id)?.playlist_id)]);
  await Promise.all([...ids].map((id) => pushDevice(id)));
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

/** Re-push connected rotating screens so they advance to the playlist's current item. */
export async function pushRotatingDevices(staggerMs = 0): Promise<void> {
  const ids = connectedDeviceIds().filter((id) => getDevice(id)?.playlist_id);
  await pushSpread(ids, staggerMs);
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

export async function pushAllConnected(staggerMs = 0): Promise<void> {
  await pushSpread(connectedDeviceIds(), staggerMs);
}
