import type { LayoutT } from "@glanceos/schema";
import { blockFor } from "./blocks";

// The layers panel: a tree of lines → blocks. Click selects (shift/⌘ adds);
// per-line buttons move, duplicate, or delete the whole line.
export function Outline({
  doc,
  selectedIds,
  onSelect,
  onMoveRow,
  onDupRow,
  onDelRow,
}: {
  doc: LayoutT;
  selectedIds: string[];
  onSelect: (id: string, additive: boolean) => void;
  onMoveRow: (i: number, dir: "up" | "down") => void;
  onDupRow: (i: number) => void;
  onDelRow: (i: number) => void;
}) {
  if (doc.rows.length === 0) return null;
  const sel = new Set(selectedIds);
  return (
    <section class="outline">
      <h3>Outline</h3>
      <div class="outline-rows">
        {doc.rows.map((row, i) => (
          <div key={row.id} class="ol-row">
            <div class="ol-row-head">
              <span class="ol-row-label">Line {i + 1}</span>
              <span class="ol-row-actions">
                <button class="ghost" title="Move up" disabled={i === 0} onClick={() => onMoveRow(i, "up")}>↑</button>
                <button class="ghost" title="Move down" disabled={i === doc.rows.length - 1} onClick={() => onMoveRow(i, "down")}>↓</button>
                <button class="ghost" title="Duplicate line" onClick={() => onDupRow(i)}>⧉</button>
                <button class="ghost" title="Delete line" onClick={() => onDelRow(i)}>✕</button>
              </span>
            </div>
            <div class="ol-blocks">
              {row.blocks.map((b) => (
                <button
                  key={b.id}
                  class={`ol-block${sel.has(b.id) ? " sel" : ""}`}
                  onClick={(e) => onSelect(b.id, (e as MouseEvent).shiftKey || (e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey)}
                >
                  <span class="ol-glyph">{blockFor(b.type).glyph}</span>
                  <span class="ol-name">{blockFor(b.type).label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
