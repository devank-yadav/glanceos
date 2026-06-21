import type { LayoutT } from "@glanceos/schema";
import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../api";

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

  // Post the draft state once the iframe is up. We can't be sure whether the
  // runtime's own state listener is attached yet (with many cached previews the
  // ready ping can race), so post on ready AND retry a couple of times — the
  // runtime just re-renders the same board, so extra posts are harmless.
  useEffect(() => {
    if (!ready) return;
    const send = () =>
      iframeRef.current?.contentWindow?.postMessage(
        { type: "glanceos:state", payload: { claimed: true, state: { layoutVersion: 0, layout: doc, data: data ?? {}, deviceName: deviceName ?? "Preview" } } },
        targetOrigin(),
      );
    send();
    const t1 = setTimeout(send, 200);
    const t2 = setTimeout(send, 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
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
        onLoad={() => setReady(true)}
      />
    </div>
  );
}

// Fetch-by-id wrapper for board listings (My boards, Shared with me, …) where the
// card only knows the layout id. Lazy + browser-cached; shows a skeleton until the
// document arrives, and renders nothing if it can't be read.
export function BoardPreviewById({ layoutId, name }: { layoutId: number; name?: string }) {
  const [doc, setDoc] = useState<LayoutT | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setDoc(null); setFailed(false);
    api.get<{ document: LayoutT }>(`/api/layouts/${layoutId}`)
      .then((r) => { if (live) setDoc(r.document); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [layoutId]);
  if (failed) return null;
  if (!doc) return <div class="board-preview board-preview-skeleton" style={{ aspectRatio: "1920 / 1080" }} />;
  return <BoardPreview doc={doc} deviceName={name} />;
}
