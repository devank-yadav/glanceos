import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./icons";

// A floating, draggable settings card with a click-outside backdrop. Shared by the
// block Options / Live-data panels and the per-page settings popover. Positioned
// absolutely (clamped to the viewport); when rendered into the stage its coords are
// stage-relative, when portalled to <body> they're viewport-relative — either works
// because the panel + backdrop share the same positioned context. The body scrolls
// when the content is taller than the room below the panel's top.
export function DraggablePanel({ x, y, title, onClose, children }: { x: number; y: number; title: string; onClose: () => void; children: ComponentChildren }) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const clamp = (px: number, py: number) => ({ x: Math.min(Math.max(4, px), vw - 80), y: Math.min(Math.max(4, py), vh - 56) });
  const [pos, setPos] = useState(() => clamp(x, y));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const onDown = (e: PointerEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* tests */ }
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setPos(clamp(e.clientX - d.dx, e.clientY - d.dy));
  };
  const onUp = () => { drag.current = null; };
  // Cap the panel to the viewport so nothing is clipped off-screen. We measure its REAL
  // viewport top after layout and cap height from there; flex column → the body scrolls.
  const panelRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState(vh);
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (el) setMaxH(Math.max(180, window.innerHeight - el.getBoundingClientRect().top - 8));
  }, [pos.x, pos.y]);
  return (
    <>
      <div class="popover-backdrop" onPointerDown={onClose} />
      <div ref={panelRef} class="block-popover draggable" style={{ left: `${pos.x}px`, top: `${pos.y}px`, maxHeight: `${maxH}px` }} onPointerDown={(e) => (e as unknown as Event).stopPropagation()}>
        <div
          class="panel-drag"
          onPointerDown={(e) => onDown(e as unknown as PointerEvent)}
          onPointerMove={(e) => onMove(e as unknown as PointerEvent)}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <Icon.grip />
          <span class="panel-drag-title">{title}</span>
          <button class="icon-btn panel-close" title="Close" onClick={onClose} onPointerDown={(e) => (e as unknown as Event).stopPropagation()}><Icon.x /></button>
        </div>
        <div class="panel-body">{children}</div>
      </div>
    </>
  );
}
