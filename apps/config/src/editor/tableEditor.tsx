import type { WidgetT } from "@glanceos/schema";
import { IconButton } from "../components/IconButton";
import { Icon } from "./icons";

// In-place table editing: a real editable grid laid over the block, instead of
// hand-editing a CSV string. Cells write back to the block's `content` prop
// (rows joined by newlines, cells by ", " — the format the screen renderer
// parses with /\s*[|,]\s*/). Add/remove rows & columns, toggle a header.

interface Box { x: number; y: number; w: number; h: number }

const parse = (s: string): string[][] => s.split(/\r?\n/).map((l) => l.split(/\s*[|,]\s*/));
const serialize = (rows: string[][]): string => rows.map((r) => r.join(", ")).join("\n");

export function TableEditor({
  box,
  scale,
  block,
  setContent,
  setHeader,
  onClose,
}: {
  box: Box;
  scale: number;
  block: WidgetT;
  setContent: (s: string) => void;
  setHeader: (b: boolean) => void;
  onClose: () => void;
}) {
  if (block.type !== "table") return null;
  const header = block.props.header;
  const rows = parse(block.props.content);
  const cols = Math.max(1, ...rows.map((r) => r.length));

  const setCell = (r: number, c: number, v: string) => {
    const next = rows.map((row) => { const copy = [...row]; while (copy.length < cols) copy.push(""); return copy; });
    next[r]![c] = v;
    setContent(serialize(next));
  };
  const addRow = () => setContent(serialize([...rows, Array(cols).fill("")]));
  const addCol = () => setContent(serialize(rows.map((r) => { const copy = [...r]; while (copy.length < cols) copy.push(""); copy.push(""); return copy; })));
  const delRow = (r: number) => { if (rows.length > 1) setContent(serialize(rows.filter((_, i) => i !== r))); };
  const delCol = (c: number) => { if (cols > 1) setContent(serialize(rows.map((r) => { const copy = [...r]; while (copy.length < cols) copy.push(""); return copy.filter((_, i) => i !== c); }))); };

  return (
    <div
      class="table-editor"
      style={{ left: `${box.x * scale}px`, top: `${box.y * scale}px`, minWidth: `${box.w * scale}px` }}
      onPointerDown={(e) => (e as unknown as Event).stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
    >
      <table class="te-grid">
        <tbody>
          <tr class="te-colctl">
            {Array.from({ length: cols }, (_, c) => (
              <td key={c}><IconButton class="te-del" icon={<Icon.x />} label={`Delete column ${c + 1}`} onClick={() => delCol(c)} /></td>
            ))}
            <td />
          </tr>
          {rows.map((row, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c}>
                  <input
                    class={`te-cell${header && r === 0 ? " te-head" : ""}`}
                    value={row[c] ?? ""}
                    autoFocus={r === 0 && c === 0}
                    onInput={(e) => setCell(r, c, (e.currentTarget as HTMLInputElement).value)}
                  />
                </td>
              ))}
              <td class="te-rowctl"><IconButton class="te-del" icon={<Icon.x />} label={`Delete row ${r + 1}`} onClick={() => delRow(r)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="te-toolbar">
        <button class="ghost" onClick={addRow}><Icon.plus /> Row</button>
        <button class="ghost" onClick={addCol}><Icon.plus /> Column</button>
        <label class="field checkbox te-header-toggle">
          <input type="checkbox" checked={header} onChange={(e) => setHeader((e.currentTarget as HTMLInputElement).checked)} />
          <span>Header row</span>
        </label>
        <span class="spacer" />
        <button class="primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
