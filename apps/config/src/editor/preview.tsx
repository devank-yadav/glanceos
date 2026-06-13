import type { LayoutT } from "@glanceos/schema";
import type { ComponentChildren, RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

// The preview IS the real screen runtime in an iframe (?preview=1): the studio
// posts draft state in, the same renderer real screens use paints it. The
// overlay (children) sits on top and owns ALL pointer input.

const DEV_SCREEN_ORIGIN = "http://localhost:5173";

const previewUrl = (): string =>
  import.meta.env.DEV ? `${DEV_SCREEN_ORIGIN}/?preview=1` : "/screen/?preview=1";

const targetOrigin = (): string => (import.meta.env.DEV ? DEV_SCREEN_ORIGIN : location.origin);

export function PreviewStage({
  W,
  H,
  scale,
  doc,
  data,
  stageRef,
  children,
}: {
  W: number;
  H: number;
  scale: number;
  doc: LayoutT;
  data: Record<string, unknown>;
  stageRef: RefObject<HTMLDivElement>;
  children: ComponentChildren;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === "glanceos:ready") setReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "glanceos:state",
        payload: {
          claimed: true,
          state: { layoutVersion: 0, layout: doc, data, deviceName: "Preview" },
        },
      },
      targetOrigin(),
    );
  }, [ready, doc, data]);

  // The wrapper is sized to the SCALED box — transforms don't affect layout,
  // so without it the page grows phantom scrollbars.
  return (
    <div ref={stageRef} class="stage" style={{ width: `${W * scale}px`, height: `${H * scale}px` }}>
      <iframe
        ref={iframeRef}
        class="stage-frame"
        src={previewUrl()}
        width={W}
        height={H}
        style={{ transform: `scale(${scale})` }}
        title="Screen preview"
        onLoad={() => setReady(true)}
      />
      {children}
    </div>
  );
}
