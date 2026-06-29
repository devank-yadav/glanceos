import { useState } from "preact/hooks";
import { Icon } from "./icons";

// #85 — saved snippets (a styled block / group), stored in localStorage so they're reusable on
// any board. studio.tsx owns save/insert/rename/delete; this panel is the management surface.
export interface SnippetMeta { id: string; name: string; count: number }

export function SnippetsPanel({ snippets, canSave, onSave, onInsert, onRename, onDelete }: {
  snippets: SnippetMeta[];
  canSave: boolean;
  onSave: () => void;
  onInsert: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  return (
    <div class="snippets-panel">
      <button class="ghost snippet-save" disabled={!canSave} onClick={onSave}>
        {canSave ? "+ Save selection as snippet" : "Select block(s) to save a snippet"}
      </button>
      {snippets.length === 0 ? (
        <p class="side-empty muted">Snippets save a styled block or group so you can drop it onto any board.</p>
      ) : (
        <ul class="snippet-list">
          {snippets.map((s) => (
            <li key={s.id} class="row spread snippet-row">
              {editing === s.id ? (
                <input
                  class="snippet-name-input" autofocus value={text}
                  onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { onRename(s.id, text); setEditing(null); } if (e.key === "Escape") setEditing(null); }}
                  onBlur={() => { onRename(s.id, text); setEditing(null); }}
                />
              ) : (
                <button class="snippet-name" title="Insert on this board" onClick={() => onInsert(s.id)}>{s.name} <span class="muted">· {s.count}</span></button>
              )}
              <span class="row" style={{ gap: "2px" }}>
                <button class="icon-btn" title="Rename" onClick={() => { setEditing(s.id); setText(s.name); }}><Icon.pencil /></button>
                <button class="icon-btn danger" title="Delete snippet" onClick={() => onDelete(s.id)}><Icon.trash /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
