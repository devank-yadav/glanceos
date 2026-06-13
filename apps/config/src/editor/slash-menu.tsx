import { useEffect, useRef, useState } from "preact/hooks";
import { BLOCKS, type WidgetType } from "./blocks";

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

  const matches = BLOCKS.filter((b) =>
    `${b.label} ${b.keywords}`.toLowerCase().includes(q.toLowerCase()),
  );
  const current = Math.min(active, Math.max(0, matches.length - 1));

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((current + 1) % Math.max(1, matches.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current - 1 + matches.length) % Math.max(1, matches.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[current]) onInsert(matches[current].type);
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
            <li
              key={b.type}
              class={i === current ? "active" : ""}
              onMouseEnter={() => setActive(i)}
              onClick={() => onInsert(b.type)}
            >
              <span class="slash-glyph">{b.glyph}</span>
              <span>
                <strong>{b.label}</strong>
                <small>{b.description}</small>
              </span>
            </li>
          ))}
          {matches.length === 0 && <li class="muted none">No matching block</li>}
        </ul>
      </div>
    </>
  );
}
