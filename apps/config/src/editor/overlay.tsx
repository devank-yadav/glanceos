import type { LayoutT } from "@glanceos/schema";
import type { RefObject } from "preact";
import { useRef } from "preact/hooks";
import type { Dispatch } from "preact/hooks";
import { blockFor, INPLACE_EDIT, TEXT_PROP } from "./blocks";
import { Icon } from "./icons";
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
  glyph: string;
  target: DropTarget | null;
  started: boolean;
  startX: number;
  startY: number;
  node: HTMLElement;
  alt: boolean; // ⌥ held → drop a copy instead of moving
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
  writeBack = (d) => d,
  dispatch,
  dragLayer,
  onDrop,
  onEdit,
  onHandleClick,
  onOpenOptions,
  onRowInsert,
  menuId,
}: {
  doc: LayoutT;
  geometry: PageGeometry;
  scale: number;
  selectedIds: string[];
  docRef: RefObject<LayoutT>;
  // v10: docRef/doc are the ACTIVE page (a lens view); writeBack folds a resized
  // active-page doc back into the right page slot so other pages stay untouched.
  writeBack?: (doc: LayoutT) => LayoutT;
  dispatch: Dispatch<EditorAction>;
  dragLayer: DragLayer;
  onDrop: (id: string, target: DropTarget, copy?: boolean) => void;
  onEdit: (id: string) => void;
  onHandleClick: (id: string) => void;
  onOpenOptions: (id: string) => void;
  onRowInsert: (rowIndex: number) => void; // v9.6 — hover "+" between rows opens the slash menu there
  menuId: string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handleDrag = useRef<HandleDrag | null>(null);
  const gutterDrag = useRef<GutterDrag | null>(null);
  const rowDrag = useRef<RowDrag | null>(null);
  // corner grip = resize height + (if a right neighbour exists) width together, from a doc
  // snapshot so both axes compose without racing each other's gestureUpdate.
  const cornerDrag = useRef<{ base: LayoutT; rowIndex: number; blockIndex: number; h0: number; startX: number; startY: number; hasRight: boolean; leftW0: number; rightW0: number; weightPerPx: number } | null>(null);
  const resizeBadge = useRef<HTMLDivElement | null>(null);

  // A live numeric readout that follows the cursor during a resize ("50% · 50%", "h 6/24").
  const showBadge = (text: string, cx: number, cy: number) => {
    const root = rootRef.current;
    if (!root) return;
    let el = resizeBadge.current;
    if (!el) { el = document.createElement("div"); el.className = "resize-badge"; root.appendChild(el); resizeBadge.current = el; }
    el.textContent = text;
    const box = root.getBoundingClientRect();
    el.style.left = `${cx - box.left + 14}px`;
    el.style.top = `${cy - box.top + 14}px`;
  };
  const hideBadge = () => { resizeBadge.current?.remove(); resizeBadge.current = null; };

  const toPage = (e: PointerEvent | MouseEvent) => {
    const box = rootRef.current!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
  };
  const sx = (v: number) => v * scale;

  // ---- handle drag (move a block) ----
  const onHandleDown = (e: PointerEvent, id: string, label: string, glyph: string, node: HTMLElement) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* no active pointer (e.g. tests) */ }
    handleDrag.current = { id, label, glyph, target: null, started: false, startX: e.clientX, startY: e.clientY, node, alt: e.altKey };
    dispatch({ type: "select", id });
  };
  const onHandleMove = (e: PointerEvent) => {
    const d = handleDrag.current;
    if (!d) return;
    d.alt = e.altKey; // ⌥ at drop time = duplicate
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
    if (!commit) return;
    // Notion-style: drag past the threshold MOVES the block (⌥ = drop a copy); a plain click
    // on the ⠿ handle (no movement) OPENS the block's options menu.
    if (d.started && d.target) onDrop(d.id, d.target, d.alt);
    else if (!d.started) onHandleClick(d.id);
  };

  // ---- column gutter (widths) ----
  const onGutterDown = (e: PointerEvent, rowIndex: number, leftIndex: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* no active pointer */ }
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
    let leftW = d.leftW0 + dWeight, rightW = d.rightW0 - dWeight;
    // Gentle snap to clean splits (⅓ · ½ · ⅔) when the ratio lands within ~2.5%.
    const sum = leftW + rightW;
    if (sum > 0) {
      const frac = leftW / sum;
      for (const s of [1 / 3, 1 / 2, 2 / 3]) if (Math.abs(frac - s) < 0.025) { leftW = sum * s; rightW = sum * (1 - s); break; }
      showBadge(`${Math.round((leftW / sum) * 100)}% · ${Math.round((rightW / sum) * 100)}%`, e.clientX, e.clientY);
    }
    dispatch({ type: "gestureUpdate", doc: writeBack(resizeColumns(docRef.current!, d.rowIndex, d.leftIndex, leftW, rightW)) });
  };

  // ---- row gutter (height) ----
  const onRowDown = (e: PointerEvent, rowIndex: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* no active pointer */ }
    rowDrag.current = { rowIndex, h0: docRef.current!.rows[rowIndex]!.h, startY: e.clientY };
    rootRef.current?.classList.add("resizing");
    dispatch({ type: "gestureStart" });
  };
  const onRowMove = (e: PointerEvent) => {
    const d = rowDrag.current;
    if (!d || geometry.unit === 0) return;
    const dUnits = ((e.clientY - d.startY) / scale) / geometry.unit;
    const h = Math.max(1, Math.min(24, Math.round(d.h0 + dUnits)));
    showBadge(`h ${h}/24`, e.clientX, e.clientY);
    dispatch({ type: "gestureUpdate", doc: writeBack(resizeRow(docRef.current!, d.rowIndex, d.h0 + dUnits)) });
  };

  // ---- corner grip (height + width together) ----
  const onCornerDown = (e: PointerEvent, rowIndex: number, blockIndex: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* no active pointer */ }
    const doc = docRef.current!;
    const row = doc.rows[rowIndex]!;
    const hasRight = blockIndex < row.blocks.length - 1;
    const totalWeight = row.blocks.reduce((s, b) => s + b.width, 0);
    const usable = geometry.rows[rowIndex]!.w - geometry.gap * (row.blocks.length - 1);
    cornerDrag.current = {
      base: doc, rowIndex, blockIndex, h0: row.h, startX: e.clientX, startY: e.clientY,
      hasRight, leftW0: row.blocks[blockIndex]!.width, rightW0: hasRight ? row.blocks[blockIndex + 1]!.width : 0,
      weightPerPx: totalWeight / usable,
    };
    rootRef.current?.classList.add("resizing");
    dispatch({ type: "gestureStart" });
  };
  const onCornerMove = (e: PointerEvent) => {
    const d = cornerDrag.current;
    if (!d || geometry.unit === 0) return;
    let doc = d.base;
    if (d.hasRight) {
      const dWeight = ((e.clientX - d.startX) / scale) * d.weightPerPx;
      let leftW = d.leftW0 + dWeight, rightW = d.rightW0 - dWeight;
      const sum = leftW + rightW;
      if (sum > 0) { const frac = leftW / sum; for (const s of [1 / 3, 1 / 2, 2 / 3]) if (Math.abs(frac - s) < 0.025) { leftW = sum * s; rightW = sum * (1 - s); break; } }
      doc = resizeColumns(doc, d.rowIndex, d.blockIndex, leftW, rightW);
    }
    const dUnits = ((e.clientY - d.startY) / scale) / geometry.unit;
    const h = Math.max(1, Math.min(24, Math.round(d.h0 + dUnits)));
    doc = resizeRow(doc, d.rowIndex, d.h0 + dUnits);
    showBadge(d.hasRight ? `↔ · h ${h}/24` : `h ${h}/24`, e.clientX, e.clientY);
    dispatch({ type: "gestureUpdate", doc: writeBack(doc) });
  };

  const endGesture = (commit: boolean) => {
    if (gutterDrag.current || rowDrag.current || cornerDrag.current) {
      gutterDrag.current = null;
      rowDrag.current = null;
      cornerDrag.current = null;
      hideBadge();
      rootRef.current?.classList.remove("resizing");
      dispatch({ type: commit ? "gestureEnd" : "gestureCancel" });
    }
  };

  // Rubber-band marquee select lives in the iframe (apps/screen/src/edit.ts): the overlay
  // root is pointer-events:none so empty-board drags land on the live preview, which draws
  // the box, hit-tests the real cell rects, and posts the selected ids back as
  // `glanceos:select` (→ selectMany). A plain empty click posts focus:null (→ deselect).

  return (
    <div
      ref={rootRef}
      class="studio-overlay"
    >
      {geometry.blocks.map((b) => {
        const widget = doc.rows[b.rowIndex]!.blocks[b.blockIndex]!;
        const editable = TEXT_PROP[widget.type] !== undefined;
        // v8.0 — unbound in-place-editable blocks: let pointer events fall through to the
        // live iframe text (caret placement), so we don't open a floating editor for them.
        const inplace = INPLACE_EDIT.has(widget.type) && !widget.source;
        const locked = !!widget.locked; // v9.0 — can't be moved/resized; still selectable + can be unlocked from its menu
        return (
          <div
            key={b.id}
            data-block={b.id}
            class={`widget-box${selectedIds.includes(b.id) ? " selected" : ""}${inplace ? " inplace" : ""}${locked ? " locked" : ""}`}
            style={{ left: `${sx(b.x)}px`, top: `${sx(b.y)}px`, width: `${sx(b.w)}px`, height: `${sx(b.h)}px` }}
            onPointerDown={(e) => {
              const ev = e as unknown as PointerEvent;
              ev.stopPropagation();
              if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
                dispatch({ type: "selectToggle", id: b.id });
              } else {
                dispatch({ type: "select", id: b.id });
                // Notion semantics: a single click on a text block drops the
                // cursor in — you just type. Non-text blocks only select.
                if (editable) onEdit(b.id);
              }
            }}
            onDblClick={(e) => {
              (e as unknown as MouseEvent).stopPropagation();
              // text blocks: double-click edits the text; everything else: open Options
              // (faster than the ⠿ menu). In-place text blocks are pointer-events:none so
              // their double-click lands on the iframe (native word-select) — this fires
              // only for non-in-place blocks.
              if (editable) onEdit(b.id);
              else onOpenOptions(b.id);
            }}
            onContextMenu={(e) => {
              // right-click a (non-in-place) block → its block menu; in-place blocks are
              // pointer-events:none so their right-click is handled in the iframe instead.
              (e as unknown as MouseEvent).preventDefault();
              (e as unknown as Event).stopPropagation();
              onHandleClick(b.id);
            }}
          >
            <span class="widget-tag">{blockFor(widget.type).label}</span>
            {locked ? (
              <span
                class={`widget-lock${menuId === b.id ? " has-menu" : ""}`}
                title="Locked · click for options"
                onPointerDown={(e) => { (e as unknown as PointerEvent).stopPropagation(); onHandleClick(b.id); }}
              >
                <Icon.lock />
              </span>
            ) : (
              <span
                class={`drag-handle${menuId === b.id ? " has-menu" : ""}`}
                title="Drag to move · click for options"
                onPointerDown={(e) => {
                  const node = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
                  onHandleDown(e as unknown as PointerEvent, b.id, blockFor(widget.type).label, blockFor(widget.type).glyph, node);
                }}
                onPointerMove={(e) => onHandleMove(e as unknown as PointerEvent)}
                onPointerUp={() => endHandle(true)}
                onPointerCancel={() => endHandle(false)}
              >
                <Icon.grip />
              </span>
            )}
            {/* Per-object resize grips, only on the selected block (Canva-style): a small
               grip at the bottom edge (height) and one on each shared column seam (width).
               They carry their own resize cursor so it never appears over the text body. */}
            {selectedIds.includes(b.id) && !widget.source && !locked && (
              <>
                <span
                  class="widget-resize resize-b"
                  title="Drag to resize height"
                  onPointerDown={(e) => onRowDown(e as unknown as PointerEvent, b.rowIndex)}
                  onPointerMove={(e) => onRowMove(e as unknown as PointerEvent)}
                  onPointerUp={() => endGesture(true)}
                  onPointerCancel={() => endGesture(false)}
                />
                {b.blockIndex < doc.rows[b.rowIndex]!.blocks.length - 1 && (
                  <span
                    class="widget-resize resize-r"
                    title="Drag to resize width"
                    onPointerDown={(e) => onGutterDown(e as unknown as PointerEvent, b.rowIndex, b.blockIndex)}
                    onPointerMove={(e) => onGutterMove(e as unknown as PointerEvent)}
                    onPointerUp={() => endGesture(true)}
                    onPointerCancel={() => endGesture(false)}
                  />
                )}
                {b.blockIndex > 0 && (
                  <span
                    class="widget-resize resize-l"
                    title="Drag to resize width"
                    onPointerDown={(e) => onGutterDown(e as unknown as PointerEvent, b.rowIndex, b.blockIndex - 1)}
                    onPointerMove={(e) => onGutterMove(e as unknown as PointerEvent)}
                    onPointerUp={() => endGesture(true)}
                    onPointerCancel={() => endGesture(false)}
                  />
                )}
                <span
                  class="widget-resize resize-corner"
                  title="Drag to resize"
                  onPointerDown={(e) => onCornerDown(e as unknown as PointerEvent, b.rowIndex, b.blockIndex)}
                  onPointerMove={(e) => onCornerMove(e as unknown as PointerEvent)}
                  onPointerUp={() => endGesture(true)}
                  onPointerCancel={() => endGesture(false)}
                />
              </>
            )}
          </div>
        );
      })}
      {/* v9.6 — a faint "+" in the gap below each row; click opens the slash menu at that index */}
      {geometry.rows.map((r, i) => (
        <div
          key={`ins-${i}`}
          class="row-insert-zone"
          style={{ left: `${sx(r.x)}px`, top: `${sx(r.y + r.h) + sx(geometry.gap) / 2}px`, width: `${sx(r.w)}px`, height: `${Math.max(sx(geometry.gap), 12)}px`, transform: "translateY(-50%)" }}
        >
          <button class="row-insert-plus" title="Insert a block here" onClick={(e) => { e.stopPropagation(); onRowInsert(i + 1); }}>+</button>
        </div>
      ))}
    </div>
  );
}
