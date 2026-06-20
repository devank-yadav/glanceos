# Device API (bring your own server)

A battery e-paper device only needs to do three things: **register once**, then on
each wake **ask what to show** and **fetch the image**. Everything else — composing
the board, fetching live data, rendering, dithering to 1-bit — happens on the
server, so the firmware stays tiny. This is the protocol the GlanceOS server
speaks; any ESP32 (or other) firmware can implement it, and it works against a
self-hosted server (no cloud, no account with anyone).

Base URL is your server, e.g. `http://glanceos.local:8080`.

## 1. Register (once)

```
POST /api/devices/register
Content-Type: application/json

{ "profile": { "width": 800, "height": 480, "colorDepth": "mono", "rotation": 0 } }
```

Response:

```json
{ "deviceId": "uuid", "deviceSecret": "hex", "claimCode": "DB5-AR5" }
```

Store `deviceId` and `deviceSecret` in NVS/flash. Show the `claimCode` on the
panel — the owner enters it in the web app to claim the device. The device's
`profile.width`/`height` decide the rendered image size, so report your panel's
real resolution.

## 2. Poll for the display (each wake)

```
GET /api/devices/me/display
Headers:
  ID:            <deviceId>          (or ?id= query param)
  Access-Token:  <deviceSecret>      (or ?secret= query param)
  Battery-Percent: 88                (optional telemetry)
  RSSI:           -52                (optional)
  FW-Version:     1.0.0              (optional)
```

Response when claimed:

```json
{
  "status": 0,
  "claimed": true,
  "image_url": "http://.../api/devices/me/render.bmp?id=...&secret=...&v=14",
  "filename": "glanceos-25-14.bmp",
  "refresh_rate": 900,
  "reset_firmware": false
}
```

- `image_url` — fetch this (it's a 1-bit BMP at your panel's resolution).
- `refresh_rate` — **deep-sleep this many seconds**, then wake and poll again.
  Set it per-device in the web app (battery vs freshness).
- The `v=` query param changes only when the board changes, so a device can skip
  re-downloading an unchanged image if it caches `filename`.

When not yet claimed the response is `{ "status": 0, "claimed": false, "claim_code": "DB5-AR5", "refresh_rate": 300 }` — show the claim code and poll again soon.

## 3. Fetch the image

```
GET /api/devices/me/render.bmp?id=<deviceId>&secret=<deviceSecret>
```

Returns a **1-bit Windows BMP** (`image/bmp`): bottom-up rows, 2-colour palette
(index 0 = black, 1 = white), each row padded to 4 bytes — what most e-paper
libraries decode directly. Two alternative formats:

- `?format=raw1` — headerless packed bits, MSB-first, row-major, top-down
  (`width/8` bytes per row). Draw straight onto the panel framebuffer, no decoder.
- `?format=png` — 8-bit grayscale PNG (handy for debugging on a computer).

The image is the *real* dashboard, rendered server-side from the same runtime a
browser screen uses (headless Chromium → grayscale → Floyd–Steinberg dither →
1-bit), so an e-ink panel and a TV show the same board, just at different bit
depths.

> Rendering needs a headless browser on the server. If it isn't installed the
> render endpoint replies `503` with how to enable it:
> `pnpm --filter @glanceos/server exec playwright install chromium`.

## 4. Report telemetry (optional)

Telemetry rides along on the `/display` headers above. To send it separately:

```
POST /api/devices/me/telemetry
Headers: ID, Access-Token
{ "battery": 88, "rssi": -52, "firmware": "1.0.0" }
```

Battery %, signal, last-seen, and firmware show up on the owner's **Screens**
dashboard, with a per-device refresh control.

## 5. Report proof-of-play (optional, signage)

A screen can log what it actually showed, for the owner's per-group report.
Send one record or a batch (max 500 per request; rate-limited like telemetry):

```
POST /api/devices/me/play-log
Headers: ID, Access-Token
{ "entries": [
  { "layoutId": 12, "shownAt": 1780000000000, "durationMs": 30000 },
  { "layoutId": 12, "zoneId": "z1", "shownAt": 1780000030000, "durationMs": 30000 }
] }
```

`shownAt` is epoch-ms (defaults to receive time if omitted); `durationMs` and
`zoneId` are optional. The owner exports a window as CSV from the **Groups** page
(`GET /api/groups/:id/play-log?days=30&format=csv`); rows are pruned after
`GLANCEOS_PLAYLOG_RETENTION_DAYS` (default 90).

## Fleet commands (web screens)

A screen connected over SSE (`/api/devices/me/stream`) also receives a `command`
event when the owner acts on its group — `reload`, `clear-cache`, `identify`
(flash a marker), or `screenshot-now`. The web runtime handles these in
`fleet.ts`; a native shell can extend the same switch.

## A minimal wake cycle

```
on wake:
  res  = GET /api/devices/me/display   (with telemetry headers)
  if res.claimed:
    img = GET res.image_url
    draw(img)
  else:
    draw_claim_code(res.claim_code)
  deep_sleep(res.refresh_rate seconds)
```

That's the whole firmware contract. Playlists (a screen rotating through several
setups) need no device changes — the server returns whichever setup is current
for this poll.

## TV / kiosk mode (web screens)

Browser-based screens (a smart TV's browser, a Pi/stick in kiosk Chromium, etc.)
can run in **TV mode** by loading `/screen/?tv=1`, or by enabling **TV mode** for
a claimed device in the config app (Screens → a device → ⋯ → *TV mode*). TV mode
adds: true fullscreen + a screen wake-lock; **overscan-safe** margins (a per-device
percentage that pulls content off the bezels); **D-pad / remote** spatial
navigation with a 10-ft focus ring; **burn-in** pixel-shift; a **wake/sleep**
window (outside it the panel shows a faint clock); and a scan-to-pair **QR** on
the claim screen. These ride the same device protocol above — no new endpoints;
the per-device settings travel in the `state` payload's optional `tv` block.

### Casting (Chromecast)

With `GLANCEOS_CAST_APP_ID` set to your registered Google Cast receiver App ID
(pointing at `https://<host>/screen/?cast=1`), the studio's share popover shows a
**Cast to TV** button. It casts a board's **public share link** — the receiver
runs the board read-only in share mode, so no device secret crosses the Cast
channel. Casting is fully opt-in: with no App ID the CSP stays strict and the
button is hidden. (AirPlay can't be initiated from a web page; it arrives with
the native tvOS app.)
