import type { StreamPayloadT } from "@glanceos/schema";
import { devicesOwnedBy, devicesUsingLayout, getDevice, type DeviceRow } from "./devices";
import { connectedDeviceIds, emit, isConnected } from "./hub";
import { getLayout } from "./layouts";
import { currentPlaylistLayout } from "./playlists";
import { resolveWidgetData } from "./widgets";

/** The layout a device shows right now — its playlist's current item, else its setup. */
export function currentLayoutId(device: DeviceRow, now = Date.now()): number | null {
  if (device.playlist_id) return currentPlaylistLayout(device.playlist_id, now);
  return device.layout_id;
}

export async function composeState(device: DeviceRow, now = Date.now()): Promise<StreamPayloadT> {
  if (!device.claimed_at) {
    return { claimed: false, claimCode: device.claim_code ?? "------" };
  }
  const layoutId = currentLayoutId(device, now);
  const layout = layoutId ? getLayout(layoutId) : undefined;
  if (!layout) {
    // First-class state: claimed, waiting for the user to pick a setup.
    return {
      claimed: true,
      state: { layoutVersion: 0, layout: null, data: {}, deviceName: device.name ?? undefined },
    };
  }
  return {
    claimed: true,
    state: {
      layoutVersion: layout.version,
      layout: layout.document,
      data: await resolveWidgetData(layout.document, device.user_id ?? ""),
      deviceName: device.name ?? undefined,
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

/** Re-push connected rotating screens so they advance to the playlist's current item. */
export async function pushRotatingDevices(): Promise<void> {
  const ids = connectedDeviceIds().filter((id) => getDevice(id)?.playlist_id);
  await Promise.all(ids.map((id) => pushDevice(id)));
}

export async function pushDeviceIds(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => pushDevice(id)));
}

/** Push every connected screen belonging to one user (task/queue changes). */
export async function pushUserDevices(userId: string): Promise<void> {
  await Promise.all(devicesOwnedBy(userId).map((d) => pushDevice(d.id)));
}

export async function pushAllConnected(): Promise<void> {
  await Promise.all(connectedDeviceIds().map((id) => pushDevice(id)));
}
