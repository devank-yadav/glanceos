import type { StreamPayloadT } from "@glanceos/schema";
import sharp from "sharp";

// Headless-Chromium screenshot of the real screen runtime — so the e-ink image
// is a photograph of the truth, never a parallel implementation. Playwright is
// loaded lazily and a single browser is reused across renders.

type Browser = Awaited<ReturnType<typeof launchChromium>>;

async function launchChromium() {
  const { chromium } = await import("playwright");
  return chromium.launch({ args: ["--no-sandbox", "--disable-gpu"] });
}

let browserPromise: Promise<Browser> | null = null;
function browser(): Promise<Browser> {
  return (browserPromise ??= launchChromium().catch((e) => {
    browserPromise = null;
    throw e;
  }));
}

export async function renderAvailable(): Promise<boolean> {
  try {
    await browser();
    return true;
  } catch {
    return false;
  }
}

/** Screenshot the board at w×h and return an 8-bit grayscale buffer. */
export async function renderGray(
  baseUrl: string,
  payload: StreamPayloadT,
  w: number,
  h: number,
): Promise<Uint8Array> {
  const page = await (await browser()).newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  try {
    await page.goto(`${baseUrl}/screen/?preview=1`, { waitUntil: "load", timeout: 12_000 });
    await page.evaluate((p) => window.postMessage({ type: "glanceos:state", payload: p }, "*"), payload as unknown);
    await page.waitForTimeout(500); // let the DOM paint and ticking widgets settle
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: w, height: h } });
    const { data } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    return new Uint8Array(data);
  } finally {
    await page.close();
  }
}

/** Expand a 1-bit buffer back to a grayscale PNG (for the dashboard preview). */
export async function bitsToPng(bits: Uint8Array, w: number, h: number): Promise<Buffer> {
  const gray = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = bits[i] === 1 ? 255 : 0;
  return sharp(gray, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
}
