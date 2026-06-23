import { useEffect, useRef, useState } from "preact/hooks";
import { BLOCKS, type BlockDef, pushRecentBlock, recentBlocks, type WidgetType } from "./blocks";
import { BlockIcon } from "./blockIcons";

/**
 * Notion-style insert menu: opens at a cell, search autofocused, arrows wrap,
 * Enter inserts, Esc closes.
 */
export function SlashMenu({
  at,
  onInsert,
  onClose,
}: {
  at: { x: number; y: number };
  onInsert: (type: WidgetType) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // No query → show recently-used first, then the full list. With a query → just matches.
  const recents: BlockDef[] = q ? [] : recentBlocks().map((t) => BLOCKS.find((b) => b.type === t)).filter((b): b is BlockDef => !!b);
  const matches = q
    ? BLOCKS.filter((b) => `${b.label} ${b.keywords}`.toLowerCase().includes(q.toLowerCase()))
    : [...recents, ...BLOCKS];
  const current = Math.min(active, Math.max(0, matches.length - 1));
  const pick = (type: WidgetType) => { pushRecentBlock(type); onInsert(type); };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((current + 1) % Math.max(1, matches.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current - 1 + matches.length) % Math.max(1, matches.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[current]) pick(matches[current].type);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
    e.stopPropagation(); // keep "/" & friends from re-triggering studio keys
  };

  return (
    <>
      <div class="slash-backdrop" onClick={onClose} />
      <div class="slash-menu" style={{ left: `${at.x}px`, top: `${at.y}px` }}>
        <input
          ref={inputRef}
          placeholder="Search blocks…"
          value={q}
          onInput={(e) => {
            setQ((e.currentTarget as HTMLInputElement).value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul>
          {matches.map((b, i) => (
            <>
              {recents.length > 0 && i === 0 && <li class="slash-head muted">Recent</li>}
              {recents.length > 0 && i === recents.length && <li class="slash-head muted">All blocks</li>}
              <li
                key={`${i}-${b.type}`}
                class={i === current ? "active" : ""}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(b.type)}
              >
                <span class="slash-glyph"><BlockIcon type={b.type} /></span>
                <span>
                  <strong>{b.label}</strong>
                  <small>{b.description}</small>
                </span>
              </li>
            </>
          ))}
          {matches.length === 0 && <li class="muted none">No matching block</li>}
        </ul>
      </div>
    </>
  );
}
