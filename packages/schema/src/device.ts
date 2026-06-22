import { z } from "zod";
import { Layout } from "./layout";

// --- TV / large-display settings (all optional → no migration; absent = today). ---
// Overscan inset as a percentage of each edge, so content clears a TV's bezel.
export const SafeArea = z.object({
  top: z.number().min(0).max(25).default(0),
  right: z.number().min(0).max(25).default(0),
  bottom: z.number().min(0).max(25).default(0),
  left: z.number().min(0).max(25).default(0),
});
export const BurnIn = z.object({
  pixelShift: z.boolean().default(false),       // nudge the page a few px periodically
  dim: z.boolean().default(false),              // dim during the "off" wake window
  screensaverAfterMin: z.number().int().min(0).max(1440).default(0), // 0 = never
});
// Display-power window in minutes-of-day (device timezone); outside it the screen blanks.
export const WakeWindow = z.object({
  startMin: z.number().int().min(0).max(1439),
  endMin: z.number().int().min(0).max(1439),
  daysMask: z.number().int().min(0).max(127).default(127), // bit per weekday, Sun=1
});

export const DeviceProfile = z.object({
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  colorDepth: z.enum(["color", "mono"]).default("color"),
  refresh: z
    .discriminatedUnion("mode", [
      z.object({ mode: z.literal("sse") }),
      z.object({ mode: z.literal("poll"), intervalSeconds: z.number().int().min(60) }),
    ])
    .default({ mode: "sse" }),
  // TV mode (optional, no migration): enables kiosk chrome + the settings below.
  tvMode: z.boolean().optional(),
  safeArea: SafeArea.optional(),
  inputMethod: z.enum(["pointer", "dpad", "touch"]).optional(),
  burnIn: BurnIn.optional(),
  wake: WakeWindow.optional(),
  // What's running the screen — a native shell self-reports these so the fleet
  // can show "Fire TV" / "Pi" etc. Free-form short strings (optional, no migration).
  platform: z.string().max(24).optional(),       // e.g. firetv, androidtv, tizen, webos, tvos, pi
  nativeVersion: z.string().max(24).optional(),  // the shell's own version string
});

// Server-computed TV settings the screen applies at render time.
export const TvState = z.object({
  enabled: z.boolean().default(false),
  safeArea: SafeArea.optional(),
  burnIn: BurnIn.optional(),
  power: z.enum(["on", "off"]).default("on"), // from the wake window
});

// What a claimed screen renders: the layout plus whatever the fetchers prepared.
export const ScreenState = z.object({
  layoutVersion: z.number().int().nonnegative(),
  layout: Layout.nullable(),
  data: z.record(z.string(), z.unknown()),
  deviceName: z.string().optional(),
  tv: TvState.optional(), // present only for TV-mode devices
  // v6.1 server-resolved presentation hints (any screen, not just TV):
  effectiveTheme: z.enum(["light", "dark"]).optional(), // resolved when theme.mode === "auto"
  quietDim: z.boolean().optional(), // true inside the screen's quiet-hours window (soft dim, not sleep)
});

// Every SSE `state` event carries one of these.
export const StreamPayload = z.discriminatedUnion("claimed", [
  z.object({ claimed: z.literal(false), claimCode: z.string() }),
  z.object({ claimed: z.literal(true), state: ScreenState }),
]);

export type DeviceProfileT = z.infer<typeof DeviceProfile>;
export type ScreenStateT = z.infer<typeof ScreenState>;
export type StreamPayloadT = z.infer<typeof StreamPayload>;
export type SafeAreaT = z.infer<typeof SafeArea>;
export type BurnInT = z.infer<typeof BurnIn>;
export type WakeWindowT = z.infer<typeof WakeWindow>;
export type TvStateT = z.infer<typeof TvState>;
