import { useEffect, useState } from "preact/hooks";
import { api, type DeviceSummary } from "../api";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Icon } from "../editor/icons";
import { fmtAgo, fmtDuration } from "../util";

// Read-only fleet overview: every screen's health at a glance, polled live.
// Reuses the existing device summary (no new endpoint).
export function FleetPage() {
  const [devices, setDevices] = useState<DeviceSummary[] | null>(null);

  useEffect(() => {
    const load = () => api.get<DeviceSummary[]>("/api/devices").then(setDevices).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const online = (devices ?? []).filter((d) => d.online).length;

  return (
    <>
      <PageHeader title="Fleet" actions={devices && devices.length > 0 ? <span class="muted">{online}/{devices.length} online</span> : undefined} />
      <div class="shell-content">
        {devices === null ? (
          <div class="skeleton skeleton-card" />
        ) : devices.length === 0 ? (
          <EmptyState icon={<Icon.monitor />} title="No screens yet" body="Connect a screen and it'll appear here with its live health." />
        ) : (
          <div class="card fleet-card">
            <table class="fleet-table">
              <thead>
                <tr><th>Screen</th><th>Status</th><th>Showing</th><th>Battery</th><th>Signal</th><th>Firmware</th><th>Last seen</th><th>Refresh</th></tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id}>
                    <td class="fleet-name">{d.name ?? "Unnamed screen"} <span class="muted fleet-res">{d.resolution}</span></td>
                    <td><span class={`fleet-status${d.online ? " online" : ""}`}><span class={d.online ? "dot online" : "dot"} />{d.online ? "Online" : "Offline"}</span></td>
                    <td class="muted">{d.layoutName ?? (d.playlistId ? "Playlist" : "—")}</td>
                    <td>{d.battery != null ? `${d.battery}%` : "—"}</td>
                    <td>{d.rssi != null ? `${d.rssi} dBm` : "—"}</td>
                    <td class="muted">{d.firmware ?? "—"}</td>
                    <td class={d.online ? "muted" : "fleet-stale"}>{d.lastSeen ? fmtAgo(d.lastSeen) : "never"}</td>
                    <td class="muted">{fmtDuration(d.refreshSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
