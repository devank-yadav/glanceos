import type { VNode } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Icon } from "../editor/icons";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  icon?: VNode;
  run: () => void;
}

// ⌘K palette: jump to any page or run an action. Substring filter, full keyboard.
export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(""); setActive(0); window.setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  const matches = useMemo(
    () => commands.filter((c) => `${c.label} ${c.hint ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())),
    [q, commands],
  );
  const cur = Math.min(active, Math.max(0, matches.length - 1));
  if (!open) return null;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((cur + 1) % Math.max(1, matches.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((cur - 1 + matches.length) % Math.max(1, matches.length)); }
    else if (e.key === "Enter") { e.preventDefault(); const c = matches[cur]; if (c) { onClose(); c.run(); } }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  return (
    <div class="sheet-backdrop palette-backdrop" onPointerDown={onClose}>
      <div class="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onPointerDown={(e) => (e as unknown as Event).stopPropagation()}>
        <div class="command-search">
          <Icon.search />
          <input
            ref={inputRef}
            placeholder="Search pages and actions…"
            value={q}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            onInput={(e) => { setQ((e.currentTarget as HTMLInputElement).value); setActive(0); }}
            onKeyDown={onKey}
          />
        </div>
        <ul class="command-list" id="cmd-list" role="listbox">
          {matches.map((c, i) => (
            <li
              key={c.id}
              class={`command-item${i === cur ? " active" : ""}`}
              role="option"
              aria-selected={i === cur}
              onMouseEnter={() => setActive(i)}
              onClick={() => { onClose(); c.run(); }}
            >
              <span class="command-icon">{c.icon}</span>
              <span class="command-label">{c.label}</span>
              {c.hint && <span class="command-hint">{c.hint}</span>}
            </li>
          ))}
          {matches.length === 0 && <li class="command-item none">No matches</li>}
        </ul>
      </div>
    </div>
  );
}
