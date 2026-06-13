import type { LayoutT } from "@glanceos/schema";
import type { RefObject } from "preact";
import { useRef } from "preact/hooks";
import type { Dispatch } from "preact/hooks";
import { blockFor, TEXT_PROP } from "./blocks";
import {
  hitTest, indicatorBox, resizeColumns, resizeRow,
  type DropTarget, type PageGeometry,
} from "./geometry";
import type { EditorAction } from "./state";
import type { DragLayer } from "./studio";

// The overlay permanently covers the scaled iframe and owns ALL pointer input.
// Notion semantics: the ⠿ handle (top-centre, clear of every resize seam)
// drags; the body selects; double-click edits text. While dragging, the
// document is untouched — a drop-indicator line plus a halo over the target
// row show exactly where things land, and the drop is one commit.

interface HandleDrag {
  id: string;
  label: string;
  target: DropTarget | null;
  started: boolean;
  startX: number;
  startY: number;
  node: HTMLElement;
}
interface GutterDrag {
  rowIndex: number;
  leftIndex: number;
  leftW0: number;
  rightW0: number;
  startX: number;
  weightPerPx: number;
}
interface RowDrag {
  rowIndex: number;
  h0: number;
  startY: number;
}

export function Overlay({
  doc,
  geometry,
  scale,
  selectedIds,
  docRef,
  dispatch,
  dragLayer,
  onDrop,
  onEdit,
  onInsertTextAt,
}: {
  doc: LayoutT;
  geometry: PageGeometry;
  scale: number;
  selectedIds: string[];
  docRef: RefObject<LayoutT>;
  dispatch: Dispatch<EditorAction>;
  dragLayer: DragLayer;
  onDrop: (id: string, target: DropTarget) => void;
  onEdit: (id: string) => void;
  onInsertTextAt: (rowIndex: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handleDrag = useRef<HandleDrag | null>(null);
  const gutterDrag = useRef<GutterDrag | null>(null);
  const rowDrag = useRef<RowDrag | null>(null);

  const toPage = (e: PointerEvent | MouseEvent) => {
    const box = rootRef.current!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
  };
  const sx = (v: number) => v * scale;

  // ---- handle drag (move a block) ----
  const onHandleDown = (e: PointerEvent, id: string, label: string, node: HTMLElement) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    handleDrag.current = { id, label, target: null, started: false, startX: e.clientX, startY: e.clientY, node };
    dispatch({ type: "select", id });
  };
  const onHandleMove = (e: PointerEvent) => {
    const d = handleDrag.current;
    if (!d) return;
    if (!d.started) {
      if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) < 4) return;
      d.started = true;
      d.node.classList.add("is-dragging-source");
      rootRef.current!.classList.add("dragging");
      dragLayer.show(d.label);
    }
    dragLayer.move(e.clientX, e.clientY);
    const { x, y } = toPage(e);
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
  const endHandle = (commit: boolean) => {
    const d = handleDrag.current;
    handleDrag.current = null;
    if (!d) return;
    d.node.classList.remove("is-dragging-source");
    rootRef.current?.classList.remove("dragging");
    dragLayer.hide();
    if (commit && d.started && d.target) onDrop(d.id, d.target);
  };

  // ---- column gutter (widths) ----
  const onGutterDown = (e: PointerEvent, rowIndex: number, leftIndex: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const row = docRef.current!.rows[rowIndex]!;
    const totalWeight = row.blocks.reduce((s, b) => s + b.width, 0);
    const usable = geometry.rows[rowIndex]!.w - geometry.gap * (row.blocks.length - 1);
    gutterDrag.current = {
      rowIndex,
      leftIndex,
      leftW0: row.blocks[leftIndex]!.width,
      rightW0: row.blocks[leftIndex + 1]!.width,
      startX: e.clientX,
      weightPerPx: totalWeight / usable,
    };
    rootRef.current?.classList.add("resizing");
    dispatch({ type: "gestureStart" });
  };
  const onGutterMove = (e: PointerEvent) => {
    const d = gutterDrag.current;
    if (!d) return;
    const dWeight = ((e.clientX - d.startX) / scale) * d.weightPerPx;
    dispatch({ type: "gestureUpdate", doc: resizeColumns(docRef.current!, d.rowIndex, d.leftIndex, d.leftW0 + dWeight, d.rightW0 - dWeight) });
  };

  // ---- row gutter (height) ----
  const onRowDown = (e: PointerEvent, rowIndex: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    rowDrag.current = { rowIndex, h0: docRef.current!.rows[rowIndex]!.h, startY: e.clientY };
    rootRef.current?.classList.add("resizing");
    dispatch({ type: "gestureStart" });
  };
  const onRowMove = (e: PointerEvent) => {
    const d = rowDrag.current;
    if (!d || geometry.unit === 0) return;
    const dUnits = ((e.clientY - d.startY) / scale) / geometry.unit;
    dispatch({ type: "gestureUpdate", doc: resizeRow(docRef.current!, d.rowIndex, d.h0 + dUnits) });
  };

  const endGesture = (commit: boolean) => {
    if (gutterDrag.current || rowDrag.current) {
      gutterDrag.current = null;
      rowDrag.current = null;
      rootRef.current?.classList.remove("resizing");
      dispatch({ type: commit ? "gestureEnd" : "gestureCancel" });
    }
  };

  const onBackgroundDown = (e: PointerEvent) => {
    if (e.target === rootRef.current) dispatch({ type: "select", id: null });
  };
  const onBackgroundDbl = (e: MouseEvent) => {
    if (e.target !== rootRef.current) return;
    const t = hitTest(docRef.current!, geometry, toPage(e).x, toPage(e).y);
    onInsertTextAt(t.kind === "row" ? t.index : t.rowIndex + 1);
  };

  return (
    <div
      ref={rootRef}
      class="studio-overlay"
      onPointerDown={(e) => onBackgroundDown(e as unknown as PointerEvent)}
      onDblClick={(e) => onBackgroundDbl(e as unknown as MouseEvent)}
    >
      {geometry.blocks.map((b) => {
        const widget = doc.rows[b.rowIndex]!.blocks[b.blockIndex]!;
        const editable = TEXT_PROP[widget.type] !== undefined;
        return (
          <div
            key={b.id}
            data-block={b.id}
            class={`widget-box${selectedIds.includes(b.id) ? " selected" : ""}`}
            style={{ left: `${sx(b.x)}px`, top: `${sx(b.y)}px`, width: `${sx(b.w)}px`, height: `${sx(b.h)}px` }}
            onPointerDown={(e) => {
              const ev = e as unknown as PointerEvent;
              ev.stopPropagation();
              dispatch(ev.shiftKey || ev.metaKey || ev.ctrlKey ? { type: "selectToggle", id: b.id } : { type: "select", id: b.id });
            }}
            onDblClick={(e) => {
              (e as unknown as MouseEvent).stopPropagation();
              if (editable) onEdit(b.id);
            }}
          >
            <span class="widget-tag">{blockFor(widget.type).label}</span>
            <span
              class="drag-handle"
              title="Drag to move"
              onPointerDown={(e) => {
                const node = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
                onHandleDown(e as unknown as PointerEvent, b.id, blockFor(widget.type).label, node);
              }}
              onPointerMove={(e) => onHandleMove(e as unknown as PointerEvent)}
              onPointerUp={() => endHandle(true)}
              onPointerCancel={() => endHandle(false)}
            >
              ⠿
            </span>
          </div>
        );
      })}

      {/* column gutters (vertical seams) */}
      {geometry.blocks
        .filter((b) => b.blockIndex < doc.rows[b.rowIndex]!.blocks.length - 1)
        .map((b) => (
          <div
            key={`cg-${b.id}`}
            class="gutter gutter-col"
            title="Drag to resize columns"
            style={{ left: `${sx(b.x + b.w + geometry.gap / 2 - 5)}px`, top: `${sx(b.y)}px`, width: `${sx(10)}px`, height: `${sx(b.h)}px` }}
            onPointerDown={(e) => onGutterDown(e as unknown as PointerEvent, b.rowIndex, b.blockIndex)}
            onPointerMove={(e) => onGutterMove(e as unknown as PointerEvent)}
            onPointerUp={() => endGesture(true)}
            onPointerCancel={() => endGesture(false)}
          />
        ))}

      {/* row gutters (horizontal seams) */}
      {geometry.rows.map((r) => (
        <div
          key={`rg-${r.index}`}
          class="gutter gutter-row"
          title="Drag to resize height"
          style={{ left: `${sx(r.x)}px`, top: `${sx(r.y + r.h + geometry.gap / 2 - 5)}px`, width: `${sx(r.w)}px`, height: `${sx(10)}px` }}
          onPointerDown={(e) => onRowDown(e as unknown as PointerEvent, r.index)}
          onPointerMove={(e) => onRowMove(e as unknown as PointerEvent)}
          onPointerUp={() => endGesture(true)}
          onPointerCancel={() => endGesture(false)}
        />
      ))}
    </div>
  );
}
