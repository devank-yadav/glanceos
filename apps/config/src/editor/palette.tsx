import type { LayoutT } from "@glanceos/schema";
import type { RefObject } from "preact";
import { useMemo, useRef, useState } from "preact/hooks";
import { BLOCKS, CATEGORIES, type BlockDef, recentBlocks, type WidgetType } from "./blocks";
import { BlockIcon } from "./blockIcons";
import { hitTest, indicatorBox, type DropTarget, type PageGeometry } from "./geometry";
import type { DragLayer } from "./studio";

// Drag a block from here onto the page (same indicator + halo as moving an
// existing block; the document only changes on drop). A plain click appends it.

interface PaletteDrag {
  block: BlockDef;
  target: DropTarget | null;
  entered: boolean;
}

export function Palette({
  stageRef,
  geometry,
  scale,
  docRef,
  dragLayer,
  onDrop,
  onClickInsert,
}: {
  stageRef: RefObject<HTMLDivElement>;
  geometry: PageGeometry;
  scale: number;
  docRef: RefObject<LayoutT>;
  dragLayer: DragLayer;
  onDrop: (type: WidgetType, target: DropTarget) => void;
  onClickInsert: (type: WidgetType) => void;
}) {
  const drag = useRef<PaletteDrag | null>(null);
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    const match = (b: BlockDef) => !query || `${b.label} ${b.keywords} ${b.category}`.toLowerCase().includes(query);
    return CATEGORIES.map((cat) => ({ cat, items: BLOCKS.filter((b) => b.category === cat && match(b)) })).filter((g) => g.items.length);
  }, [q]);

  // v9.6 — a "Recent" group atop the palette (mirrors the slash menu). Computed each render
  // (not memoized) so it refreshes after an insert re-renders the editor. Hidden while searching.
  const recents: BlockDef[] = q.trim()
    ? []
    : recentBlocks().map((t) => BLOCKS.find((b) => b.type === t)).filter((b): b is BlockDef => !!b);
  const shown = recents.length ? [{ cat: "Recent", items: recents }, ...groups] : groups;

  const sx = (v: number) => v * scale;

  const onPointerDown = (e: PointerEvent, block: BlockDef) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { block, target: null, entered: false };
    dragLayer.show(block.label);
    dragLayer.move(e.clientX, e.clientY);
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    const stage = stageRef.current;
    if (!d || !stage) return;
    dragLayer.move(e.clientX, e.clientY);
    const box = stage.getBoundingClientRect();
    const inside = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
    if (!inside) {
      if (d.target) {
        d.target = null;
        dragLayer.indicate(null);
        dragLayer.halo(null);
      }
      return;
    }
    d.entered = true;
    const x = (e.clientX - box.left) / scale;
    const y = (e.clientY - box.top) / scale;
    const target = hitTest(docRef.current!, geometry, x, y);
    if (JSON.stringify(target) !== JSON.stringify(d.target)) {
      d.target = target;
      const ind = indicatorBox(geometry, target);
      dragLayer.indicate({ x: sx(ind.x), y: sx(ind.y), w: sx(ind.w), h: sx(ind.h) });
      const rowIdx = target.kind === "side" ? target.rowIndex : Math.min(target.index, geometry.rows.length - 1);
      const r = geometry.rows[Math.max(0, rowIdx)];
      dragLayer.halo(r ? { x: sx(r.x), y: sx(r.y), w: sx(r.w), h: sx(r.h) } : null);
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    dragLayer.hide();
    if (!d) return;
    if (d.target) onDrop(d.block.type, d.target);
    else if (!d.entered) onClickInsert(d.block.type);
  };
  const onPointerCancel = () => {
    drag.current = null;
    dragLayer.hide();
  };

  return (
    <section class="palette">
      <input class="palette-search" placeholder="Search blocks…" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
      <p class="muted palette-hint">Drag onto the board (edges make columns) or click to append. Press <kbd>/</kbd> on the board too.</p>
      <div class="palette-scroll">
        {shown.map((g) => (
          <div key={g.cat} class="palette-group">
            <div class="palette-cat">{g.cat}</div>
            <div class="palette-grid">
              {g.items.map((b) => (
                <button
                  key={b.type}
                  class="palette-item"
                  title={b.description}
                  onPointerDown={(e) => onPointerDown(e as unknown as PointerEvent, b)}
                  onPointerMove={(e) => onPointerMove(e as unknown as PointerEvent)}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                >
                  <span class="palette-glyph"><BlockIcon type={b.type} /></span>
                  <span class="palette-name">{b.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {shown.length === 0 && <p class="muted">No blocks match.</p>}
      </div>
    </section>
  );
}
