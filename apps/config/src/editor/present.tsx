import type { LayoutT } from "@glanceos/schema";
import { useEffect, useRef, useState } from "preact/hooks";

// Full-screen preview: the real screen runtime in an iframe, scaled to the
// viewport, with all editor chrome hidden. Esc or click exits.
const DEV = "http://localhost:5173";
const previewUrl = () => (import.meta.env.DEV ? `${DEV}/?preview=1` : "/screen/?preview=1");
const targetOrigin = () => (import.meta.env.DEV ? DEV : location.origin);

export function Present({
  doc,
  data,
  W,
  H,
  onClose,
}: {
  doc: LayoutT;
  data: Record<string, unknown>;
  W: number;
  H: number;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === "glanceos:ready") setReady(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (!ready) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "glanceos:state", payload: { claimed: true, state: { layoutVersion: 0, layout: doc, data, deviceName: "Present" } } },
      targetOrigin(),
    );
  }, [ready, doc, data]);

  const scale = Math.min((size.w - 40) / W, (size.h - 40) / H);
  return (
    <div class="present" onClick={onClose}>
      <div class="present-stage" style={{ width: `${W * scale}px`, height: `${H * scale}px` }} onClick={(e) => e.stopPropagation()}>
        <iframe
          ref={iframeRef}
          src={previewUrl()}
          width={W}
          height={H}
          style={{ transform: `scale(${scale})` }}
          title="Present"
          onLoad={() => setReady(true)}
        />
      </div>
      <button class="present-close" onClick={onClose}>Esc to exit</button>
    </div>
  );
}
