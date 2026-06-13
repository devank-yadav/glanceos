import type { BlockBox } from "./geometry";

// A floating contextual toolbar that anchors to the selected block using the
// editor's own scaled geometry (no layout math). Single-click a block → this
// appears just above it; the ⠿ handle still moves the block. It is the primary
// way to edit a block on the board, replacing trips to the side panel.

interface Props {
  box: BlockBox;
  scale: number;
  stageW: number;
  canEdit: boolean;
  canBind: boolean;
  bound: boolean;
  onEdit: () => void;
  onConvert: () => void;
  onData: () => void;
  onOptions: () => void;
  onDelete: () => void;
}

const BAR_H = 34;

export function BlockToolbar({ box, scale, stageW, canEdit, canBind, bound, onEdit, onConvert, onData, onOptions, onDelete }: Props) {
  const x = box.x * scale;
  const yAbove = box.y * scale - BAR_H - 6;
  const top = yAbove < 2 ? box.y * scale + 6 : yAbove; // flip below when near the top edge
  const left = Math.min(Math.max(2, x), Math.max(2, stageW - 196));
  // Keep clicks off the overlay so the block stays selected.
  const stop = (e: Event) => e.stopPropagation();
  return (
    <div class="block-toolbar" style={{ left: `${left}px`, top: `${top}px` }} onPointerDown={stop} onMouseDown={stop}>
      {canEdit && <button class="bt-btn" title="Edit content" onClick={onEdit}>✎</button>}
      <button class="bt-btn" title="Change block type" onClick={onConvert}>⤳</button>
      {canBind && (
        <button class={`bt-btn${bound ? " bt-on" : ""}`} title={bound ? "Edit data source" : "Connect live data"} onClick={onData}>⟿</button>
      )}
      <button class="bt-btn" title="Options & style" onClick={onOptions}>⚙</button>
      <button class="bt-btn bt-danger" title="Delete block" onClick={onDelete}>⌫</button>
    </div>
  );
}
