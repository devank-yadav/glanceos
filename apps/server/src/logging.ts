import type { Context, Next } from "hono";

// Opt-in structured request logging (GLANCEOS_LOG=json). Logs the PATH only —
// never query strings (a share ?pw lives there), cookies, or device secrets —
// and never the SSE stream (it never "completes", so it'd never log + would pin
// a timer). Off by default so stdout stays calm.
const ON = process.env.GLANCEOS_LOG === "json";

export function requestLogger() {
  return async (c: Context, next: Next) => {
    if (!ON || c.req.path === "/api/devices/me/stream") return next();
    const start = Date.now();
    await next();
    console.log(JSON.stringify({
      at: new Date(start).toISOString(),
      method: c.req.method,
      path: c.req.path, // path only — no query/cookies/secrets
      status: c.res.status,
      ms: Date.now() - start,
    }));
  };
}
