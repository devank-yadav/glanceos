import { serve } from "@hono/node-server";
import { buildApp } from "./api";
import { migrate } from "./db";
import { seedTemplates } from "./seed";
import { pushAllConnected, pushRotatingDevices } from "./state";

migrate();
seedTemplates();

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: buildApp().fetch, port }, (info) => {
  console.log(`[glanceos] server on http://localhost:${info.port}`);
});

// Weather and calendars drift on their own — refresh connected screens periodically.
setInterval(() => {
  pushAllConnected().catch(() => {});
}, 5 * 60 * 1000);

// Advance rotating (playlist) screens to their current item.
setInterval(() => {
  pushRotatingDevices().catch(() => {});
}, 10 * 1000);
