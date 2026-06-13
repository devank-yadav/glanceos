import type { LayoutT } from "@glanceos/schema";

/**
 * Gray-box layout thumbnail: pure structure (row heights + column widths), no
 * widget rendering — the config app never renders widgets.
 */
export function Thumb({ doc }: { doc: LayoutT }) {
  return (
    <div class="thumb">
      {doc.rows.map((row) => (
        <div key={row.id} class="thumb-row" style={{ flexGrow: row.h }}>
          {row.blocks.map((b) => (
            <div key={b.id} class="thumb-cell" style={{ flexGrow: b.width }} />
          ))}
        </div>
      ))}
      {doc.rows.length === 0 && <div class="thumb-row" style={{ flexGrow: 1 }} />}
    </div>
  );
}
