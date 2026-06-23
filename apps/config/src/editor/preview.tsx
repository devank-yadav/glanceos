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
  sizeLabel,
  editMode,
  onEdit,
  onFocus,
  onSelect,
  onMenu,
  children,
}: {
  W: number;
  H: number;
  scale: number;
  doc: LayoutT;
  data: Record<string, unknown>;
  stageRef: RefObject<HTMLDivElement>;
  sizeLabel?: string;
  editMode?: boolean; // load the in-iframe edit layer + accept edits back (v8.0)
  onEdit?: (id: string, patch: Record<string, unknown>) => void;
  onFocus?: (id: string | null) => void;
  onSelect?: (ids: string[], add?: boolean) => void; // v9.2 — rubber-band marquee selection from the board (add = Shift-drag)
  onMenu?: (id: string) => void; // v9.4 — right-click an in-place block → open its block menu
  children: ComponentChildren;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Only trust messages from OUR preview iframe origin (cross-origin in dev).
      if (e.origin !== targetOrigin()) return;
      const m = e.data as { type?: string; id?: string | null; patch?: Record<string, unknown>; ids?: string[]; add?: boolean };
      if (m?.type === "glanceos:ready") setReady(true);
      else if (m?.type === "glanceos:edit" && m.id && m.patch) onEdit?.(m.id, m.patch);
      else if (m?.type === "glanceos:focus") onFocus?.(m.id ?? null);
      else if (m?.type === "glanceos:select" && Array.isArray(m.ids)) onSelect?.(m.ids, m.add);
      else if (m?.type === "glanceos:menu" && m.id) onMenu?.(m.id);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onEdit, onFocus, onSelect, onMenu]);

  useEffect(() => {
    if (!ready) return;
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "glanceos:state",
        edit: !!editMode,
        payload: {
          claimed: true,
          state: { layoutVersion: 0, layout: doc, data, deviceName: "Preview" },
        },
      },
      targetOrigin(),
    );
  }, [ready, doc, data, editMode]);

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
      {sizeLabel && <div class="stage-size-label">{sizeLabel} · {W}×{H}</div>}
    </div>
  );
}
