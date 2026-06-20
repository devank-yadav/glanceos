import type { LayoutT } from "@glanceos/schema";
import { useEffect, useRef, useState } from "preact/hooks";

// A live, full-colour mini-render of a board: the real screen runtime in an
// /screen/?preview=1 iframe (the same renderer screens use), scaled down to fit
// its container. We post the layout in and the runtime paints it — no widgets
// are re-implemented here. Reused by the dashboard cards and the Hub gallery.

const previewUrl = (): string => (import.meta.env.DEV ? "http://localhost:5173/?preview=1" : "/screen/?preview=1");
const targetOrigin = (): string => (import.meta.env.DEV ? "http://localhost:5173" : location.origin);

export function BoardPreview({
  doc,
  data,
  w = 1920,
  h = 1080,
  deviceName,
}: {
  doc: LayoutT;
  data?: Record<string, unknown>;
  w?: number;
  h?: number;
  deviceName?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(0);

  // Scale the native-size iframe down to whatever width the card gives us.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / w);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);

  // Source-check the ready ping: several previews can be mounted at once, so a
  // bare "glanceos:ready" would cross-trigger and post state to iframes that
  // haven't booted yet. Only react to OUR iframe's window.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source === iframeRef.current?.contentWindow && (e.data as { type?: string })?.type === "glanceos:ready") setReady(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (!ready) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "glanceos:state", payload: { claimed: true, state: { layoutVersion: 0, layout: doc, data: data ?? {}, deviceName: deviceName ?? "Preview" } } },
      targetOrigin(),
    );
  }, [ready, doc, data, deviceName]);

  return (
    <div ref={wrapRef} class="board-preview" style={{ aspectRatio: `${w} / ${h}` }}>
      <iframe
        ref={iframeRef}
        class="board-preview-frame"
        src={previewUrl()}
        width={w}
        height={h}
        loading="lazy"
        title={deviceName ? `${deviceName} preview` : "Board preview"}
        style={{ transform: `scale(${scale})`, transformOrigin: "top left", visibility: scale ? "visible" : "hidden" }}
      />
    </div>
  );
}
