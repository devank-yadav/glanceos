import type { BlockBox } from "./geometry";
import { Icon } from "./icons";

// A Notion-style block options menu. It opens only when the ⠿ handle is CLICKED
// (drag still moves the block) and anchors just below the handle — it is not a
// permanent toolbar on every selection.

interface Props {
  box: BlockBox;
  scale: number;
  stageW: number;
  canEdit: boolean;
  canBind: boolean;
  bound: boolean;
  locked: boolean;
  canEqualize: boolean; // the block shares its row with others → offer equal-width
  editItems?: "tasks" | "queue" | null; // interactive blocks edit their items/counter in Options
  onEdit: () => void;
  onConvert: () => void;
  onData: () => void;
  onOptions: () => void;
  onToggleLock: () => void;
  onEqualize: () => void;
  onDelete: () => void;
}

const MENU_W = 188;

export function BlockMenu({ box, scale, stageW, canEdit, canBind, bound, locked, canEqualize, editItems, onEdit, onConvert, onData, onOptions, onToggleLock, onEqualize, onDelete }: Props) {
  const left = Math.min(Math.max(2, box.x * scale), Math.max(2, stageW - MENU_W));
  const top = Math.max(4, box.y * scale + 6);
  const stop = (e: Event) => e.stopPropagation();
  return (
    <ul class="block-menu" style={{ left: `${left}px`, top: `${top}px` }} onPointerDown={stop} onMouseDown={stop}>
      {editItems && (
        <li><button class="bm-item" onClick={onOptions}><Icon.list /> {editItems === "queue" ? "Edit queue" : "Edit items"}</button></li>
      )}
      {canEdit && (
        <li><button class="bm-item" onClick={onEdit}><Icon.pencil /> Edit text</button></li>
      )}
      <li><button class="bm-item" onClick={onConvert}><Icon.convert /> Change type</button></li>
      {canEqualize && (
        <li><button class="bm-item" onClick={onEqualize}><Icon.grid /> Equalize widths</button></li>
      )}
      {canBind && (
        <li><button class={`bm-item${bound ? " bm-on" : ""}`} onClick={onData}><Icon.link /> {bound ? "Edit data source" : "Connect data"}</button></li>
      )}
      <li><button class="bm-item" onClick={onOptions}><Icon.settings /> Options &amp; style</button></li>
      <li><button class={`bm-item${locked ? " bm-on" : ""}`} onClick={onToggleLock}><Icon.lock /> {locked ? "Unlock" : "Lock"}</button></li>
      <li><button class="bm-item bm-danger" onClick={onDelete}><Icon.trash /> Delete</button></li>
    </ul>
  );
}
