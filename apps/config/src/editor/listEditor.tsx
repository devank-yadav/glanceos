import type { WidgetT } from "@glanceos/schema";
import { useEffect, useRef } from "preact/hooks";
import { IconButton } from "../components/IconButton";
import { Icon } from "./icons";

// In-place list editing: one input per line laid over the block. Enter adds a
// line below, Backspace on an empty line removes it and jumps up, ↑/↓ move
// between lines. Checklists get a real checkbox that toggles the "x " done
// marker the screen renderer reads (/^(\[?x\]?|✓)\s+/i). Items stay a single
// newline-joined string — no schema change.

interface Box { x: number; y: number; w: number; h: number }

const CHECKABLE = new Set(["checklist"]);
const DONE_RE = /^(\[?x\]?|✓)\s+/i;
const STRIP_RE = /^(\[?x\]?|\[?\s?\]?|✓|-)\s+/i;

export function ListEditor({
  box,
  scale,
  block,
  prop,
  setItems,
  onClose,
}: {
  box: Box;
  scale: number;
  block: WidgetT;
  prop: string;
  setItems: (s: string) => void;
  onClose: () => void;
}) {
  const checkable = CHECKABLE.has(block.type);
  const raw = String((block.props as Record<string, unknown>)[prop] ?? "");
  const lines = raw.split(/\r?\n/);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);

  // After a structural change (add/remove), move the caret to the target line.
  useEffect(() => {
    if (pendingFocus.current == null) return;
    const el = inputs.current[pendingFocus.current];
    if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); }
    pendingFocus.current = null;
  });

  const labelOf = (l: string) => (checkable ? l.replace(STRIP_RE, "") : l);
  const doneOf = (l: string) => checkable && DONE_RE.test(l);
  const compose = (label: string, done: boolean) => (checkable && done ? `x ${label}` : label);

  const commit = (next: string[], focus?: number) => { if (focus != null) pendingFocus.current = focus; setItems(next.join("\n")); };
  const setLine = (i: number, label: string) => { const n = [...lines]; n[i] = compose(label, doneOf(lines[i] ?? "")); commit(n); };
  const toggle = (i: number) => { const n = [...lines]; n[i] = compose(labelOf(lines[i] ?? ""), !doneOf(lines[i] ?? "")); commit(n); };
  const addAfter = (i: number) => { const n = [...lines]; n.splice(i + 1, 0, ""); commit(n, i + 1); };
  const removeAt = (i: number) => { if (lines.length <= 1) return; commit(lines.filter((_, k) => k !== i), Math.max(0, i - 1)); };

  const marker = (i: number) => (block.type === "numberedList" ? `${i + 1}.` : block.type === "steps" ? `${i + 1}` : "•");

  return (
    <div
      class="list-editor"
      style={{ left: `${box.x * scale}px`, top: `${box.y * scale}px`, minWidth: `${box.w * scale}px` }}
      onPointerDown={(e) => (e as unknown as Event).stopPropagation()}
    >
      <div class="le-rows">
        {lines.map((l, i) => (
          <div class="le-row" key={i}>
            {checkable ? (
              <button class={`le-check${doneOf(l) ? " on" : ""}`} aria-pressed={doneOf(l)} aria-label="Toggle done" onClick={() => toggle(i)}>
                {doneOf(l) ? <Icon.check /> : null}
              </button>
            ) : (
              <span class="le-marker">{marker(i)}</span>
            )}
            <input
              class={`le-input${doneOf(l) ? " le-done" : ""}`}
              value={labelOf(l)}
              autoFocus={i === 0}
              ref={(el) => { inputs.current[i] = el as HTMLInputElement | null; }}
              onInput={(e) => setLine(i, (e.currentTarget as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addAfter(i); }
                else if (e.key === "Backspace" && (e.currentTarget as HTMLInputElement).value === "") { e.preventDefault(); removeAt(i); }
                else if (e.key === "Escape") { e.preventDefault(); onClose(); }
                else if (e.key === "ArrowDown") { e.preventDefault(); inputs.current[i + 1]?.focus(); }
                else if (e.key === "ArrowUp") { e.preventDefault(); inputs.current[i - 1]?.focus(); }
              }}
            />
            <IconButton class="le-del" icon={<Icon.x />} label={`Delete line ${i + 1}`} onClick={() => removeAt(i)} />
          </div>
        ))}
      </div>
      <div class="le-toolbar">
        <button class="ghost" onClick={() => addAfter(lines.length - 1)}><Icon.plus /> Item</button>
        <span class="spacer" />
        <button class="primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
