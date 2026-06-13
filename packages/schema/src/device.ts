import { z } from "zod";
import { Layout } from "./layout";

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
});

// What a claimed screen renders: the layout plus whatever the fetchers prepared.
export const ScreenState = z.object({
  layoutVersion: z.number().int().nonnegative(),
  layout: Layout.nullable(),
  data: z.record(z.string(), z.unknown()),
  deviceName: z.string().optional(),
});

// Every SSE `state` event carries one of these.
export const StreamPayload = z.discriminatedUnion("claimed", [
  z.object({ claimed: z.literal(false), claimCode: z.string() }),
  z.object({ claimed: z.literal(true), state: ScreenState }),
]);

export type DeviceProfileT = z.infer<typeof DeviceProfile>;
export type ScreenStateT = z.infer<typeof ScreenState>;
export type StreamPayloadT = z.infer<typeof StreamPayload>;
