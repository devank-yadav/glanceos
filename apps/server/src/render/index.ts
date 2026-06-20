import type { StreamPayloadT } from "@glanceos/schema";
import { encodeBmp1 } from "./bmp";
import { DEFAULT_DITHER, dither, type DitherOpts, packRaw1 } from "./dither";
import { bitsToPng, renderAvailable, renderGray } from "./screenshot";

export type RenderFormat = "bmp" | "raw1" | "png";

export interface RenderResult {
  buf: Buffer;
  contentType: string;
}

// Short cache so a chatty device or a dashboard refresh doesn't re-render the
// same screen repeatedly. Keyed by what actually changes the pixels.
interface Cached {
  at: number;
  result: RenderResult;
}
const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<RenderResult>>();
const TTL_MS = 20_000;

const CONTENT_TYPE: Record<RenderFormat, string> = {
  bmp: "image/bmp",
  raw1: "application/octet-stream",
  png: "image/png",
};

/** Render the board to a 1-bit image (or grayscale PNG preview). */
export async function renderImage(
  baseUrl: string,
  payload: StreamPayloadT,
  w: number,
  h: number,
  format: RenderFormat,
  cacheKey: string,
  opts: DitherOpts = DEFAULT_DITHER,
): Promise<RenderResult> {
  const key = `${cacheKey}:${w}x${h}:${format}:${opts.algo}:${opts.threshold}:${opts.gamma}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result;
  const existing = inflight.get(key);
  if (existing) return existing;

  const p = (async () => {
    const gray = await renderGray(baseUrl, payload, w, h);
    const bits = dither(gray, w, h, opts);
    let result: RenderResult;
    if (format === "raw1") result = { buf: packRaw1(bits, w, h), contentType: CONTENT_TYPE.raw1 };
    else if (format === "png") result = { buf: await bitsToPng(bits, w, h), contentType: CONTENT_TYPE.png };
    else result = { buf: encodeBmp1(bits, w, h), contentType: CONTENT_TYPE.bmp };
    cache.set(key, { at: Date.now(), result });
    inflight.delete(key);
    return result;
  })().catch((e) => {
    inflight.delete(key);
    throw e;
  });
  inflight.set(key, p);
  return p;
}

export { renderAvailable };
export { toDitherOpts, type DitherOpts } from "./dither";
