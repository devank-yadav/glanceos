# devices/esp32-eink

The calmest endpoint: a battery-powered e-paper panel that wakes, fetches, draws, and sleeps. Empty on purpose — and staying empty the longest: work starts in **P5**, built with Track E, *after* the server-side render pipeline exists (which removes most of the risk before any hardware is bought).

**Will contain:**
- A PlatformIO project (Arduino framework — see DECISIONS when the entry lands at P5; not ESP-IDF for v1)
- The loop: deep-sleep → wake on timer → `GET /api/devices/me/render?format=raw1` with `If-None-Match` → draw via GxEPD2 only if changed → sleep. A `304` costs microjoules; that's the whole battery story.
- Button firmware: GPIO interrupt wake, debounce, `POST /api/devices/me/events` → server → Home Assistant (light/fan toggle)
- `POWER.md` — measured (multimeter, not datasheet) current in sleep and active states, kept honest from exercise E1 onward

**Must never contain:** layout parsing or rendering (the server renders; the MCU draws pixels), TLS gymnastics (plain HTTP on the LAN, threat model documented in ARCHITECTURE), or pairing UI.

**Hardware gate (P5, ~₹8k):** ESP32 devkit + Waveshare **SPI** e-paper, 4.2" to learn on. The Alibaba 6" 758×1024 e-reader panels need an IT8951 driver board — that's a v2 BOM optimization, not a learning vehicle ([ARCHITECTURE §12](../../docs/ARCHITECTURE.md)).
