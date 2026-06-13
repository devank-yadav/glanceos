import { Layout, type LayoutT, type WidgetT } from "@glanceos/schema";
import { useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import { api, type DeviceSummary, type LayoutRecord } from "../api";
import { BLOCKS, blockFor, ENTER_BREAKS, makeBlock, newWidgetId, SINGLE_LINE, TEXT_PROP, type WidgetType } from "./blocks";
import {
  applyDrop, indicatorBox, moveBlock, moveRow, pageGeometry, removeBlocks, type DropTarget,
} from "./geometry";
import { Overlay } from "./overlay";
import { Palette } from "./palette";
import { Present } from "./present";
import { PreviewStage } from "./preview";
import { BlockFields, BoardSettings } from "./properties";
import { Shortcuts } from "./shortcuts";
import { SlashMenu } from "./slash-menu";
import { BlockToolbar } from "./toolbar";
import { editorReducer, initialEditor, primaryId } from "./state";

const SIZES: Record<string, [number, number]> = {
  "1920×1080": [1920, 1080],
  "1280×800": [1280, 800],
  "800×480": [800, 480],
  "1080×1920": [1080, 1920],
};
const SIZE_KEY = "glanceos.previewSize";
const CLIP_KEY = "glanceos.clipboard";
const ZOOMS: Array<{ label: string; value: number | null }> = [
  { label: "Fit", value: null },
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1 },
  { label: "125%", value: 1.25 },
];

const PLACEHOLDER: LayoutT = { schemaVersion: 3, name: "Loading…", theme: { mode: "light" }, gap: 2, align: "top", rows: [] };
const KNOWN = new Set(BLOCKS.map((b) => b.type));

export interface DragLayer {
  show(label: string): void;
  move(clientX: number, clientY: number): void;
  indicate(box: { x: number; y: number; w: number; h: number } | null): void;
  halo(box: { x: number; y: number; w: number; h: number } | null): void;
  hide(): void;
}

interface Editing {
  id: string;
  prop: string;
  multiline: boolean;
}

export function Studio({ layoutId }: { layoutId: number }) {
  const [state, dispatch] = useReducer(editorReducer, PLACEHOLDER, initialEditor);
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [liveOn, setLiveOn] = useState(0);
  const [sizeKey, setSizeKey] = useState(() => {
    const s = localStorage.getItem(SIZE_KEY);
    return s && SIZES[s] ? s : "1920×1080";
  });
  const [zoom, setZoom] = useState<number | null>(null);
  const [slashRow, setSlashRow] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [convertId, setConvertId] = useState<string | null>(null);
  const [paneSize, setPaneSize] = useState({ w: 960, h: 560 });

  const stageRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const docRef = useRef<LayoutT>(state.present);
  docRef.current = state.present;
  const selectedRef = useRef<string[]>(state.selectedIds);
  selectedRef.current = state.selectedIds;
  const primaryRef = useRef<string | null>(primaryId(state));
  primaryRef.current = primaryId(state);
  const slashRef = useRef<number | null>(slashRow);
  slashRef.current = slashRow;
  const overlayRef = useRef({ presenting, showHelp, slashOpen: slashRow !== null, editing: !!editing, popover: false });
  overlayRef.current = { presenting, showHelp, slashOpen: slashRow !== null, editing: !!editing, popover: optionsOpen || convertId !== null };
  const lastSavedRef = useRef("");
  const typingTimer = useRef<number | undefined>(undefined);

  const dragLayer = useMemo<DragLayer>(() => {
    const place = (ref: { current: HTMLDivElement | null }, box: { x: number; y: number; w: number; h: number } | null) => {
      const el = ref.current;
      if (!el) return;
      if (!box) {
        el.style.display = "none";
        return;
      }
      el.style.display = "block";
      el.style.left = `${box.x}px`;
      el.style.top = `${box.y}px`;
      el.style.width = `${box.w}px`;
      el.style.height = `${box.h}px`;
    };
    return {
      show(label) {
        const g = ghostRef.current;
        if (g) {
          g.textContent = label;
          g.style.display = "block";
        }
      },
      move(x, y) {
        if (ghostRef.current) ghostRef.current.style.transform = `translate(${x + 14}px, ${y + 10}px)`;
      },
      indicate: (box) => place(indicatorRef, box),
      halo: (box) => place(haloRef, box),
      hide() {
        if (ghostRef.current) ghostRef.current.style.display = "none";
        place(indicatorRef, null);
        place(haloRef, null);
      },
    };
  }, []);

  useEffect(() => {
    api.get<LayoutRecord>(`/api/layouts/${layoutId}`).then(
      (record) => {
        lastSavedRef.current = JSON.stringify(record.document);
        dispatch({ type: "replace", doc: record.document });
        setLoaded(true);
      },
      () => setMissing(true),
    );
    api.get<DeviceSummary[]>("/api/devices").then((d) => setLiveOn(d.filter((x) => x.layoutId === layoutId).length)).catch(() => {});
  }, [layoutId]);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const obs = new ResizeObserver(() => setPaneSize({ w: pane.clientWidth - 32, h: pane.clientHeight - 32 }));
    obs.observe(pane);
    return () => obs.disconnect();
  }, []);

  const [W, H] = SIZES[sizeKey] ?? [1920, 1080];
  const fitScale = Math.min(paneSize.w / W, paneSize.h / H);
  const scale = zoom ?? fitScale;
  const geometry = useMemo(() => pageGeometry(state.present, W, H), [state.present, W, H]);

  // autosave
  useEffect(() => {
    if (!loaded || state.gestureBase) return;
    if (JSON.stringify(state.present) === lastSavedRef.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      const parsed = Layout.safeParse(docRef.current);
      if (!parsed.success) {
        setSaveState("error");
        setSaveError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        return;
      }
      try {
        await api.put(`/api/layouts/${layoutId}`, { document: parsed.data });
        lastSavedRef.current = JSON.stringify(docRef.current);
        setSaveState("saved");
        setSaveError("");
      } catch (e) {
        setSaveState("error");
        setSaveError(String(e instanceof Error ? e.message : e));
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [state.present, state.gestureBase, loaded, layoutId]);

  // preview data (structure excluded so drags cost no server calls)
  const dataKey = useMemo(
    () => JSON.stringify(state.present.rows.flatMap((r) => r.blocks).map((b) => [b.id, b.type, b.props])),
    [state.present],
  );
  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      api.post<{ data: Record<string, unknown> }>("/api/layouts/preview-state", { document: docRef.current })
        .then((r) => setData(r.data))
        .catch(() => {});
    }, 400);
    return () => window.clearTimeout(timer);
  }, [dataKey, loaded]);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      const len = editRef.current.value.length;
      editRef.current.setSelectionRange(len, len);
    }
  }, [editing?.id]);

  const commitDoc = (doc: LayoutT) => dispatch({ type: "commit", doc });

  const stageEdit = (mutate: (d: LayoutT) => void) => {
    dispatch({ type: "gestureStart" });
    const doc = structuredClone(docRef.current);
    mutate(doc);
    dispatch({ type: "gestureUpdate", doc });
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => dispatch({ type: "gestureEnd" }), 500);
  };

  const selectedBlocks = (): WidgetT[] => {
    const ids = new Set(selectedRef.current);
    return docRef.current.rows.flatMap((r) => r.blocks).filter((b) => ids.has(b.id));
  };
  const clone = (b: WidgetT): WidgetT => ({ ...structuredClone(b), id: newWidgetId(), width: 1 });

  const insertBlocksAfter = (blocks: WidgetT[]) => {
    if (!blocks.length) return;
    const doc = structuredClone(docRef.current);
    let after = doc.rows.length - 1;
    const primary = primaryRef.current;
    if (primary) doc.rows.forEach((r, i) => (r.blocks.some((b) => b.id === primary) ? (after = i) : null));
    blocks.forEach((b, k) => doc.rows.splice(after + 1 + k, 0, { id: newWidgetId(), h: blockFor(b.type).defaultH, blocks: [b] }));
    commitDoc(doc);
    dispatch({ type: "selectMany", ids: blocks.map((b) => b.id) });
  };

  const removeSelected = () => {
    if (!selectedRef.current.length) return;
    commitDoc(removeBlocks(docRef.current, new Set(selectedRef.current)));
    dispatch({ type: "select", id: null });
  };
  const duplicateSelected = () => insertBlocksAfter(selectedBlocks().map(clone));
  const copySelected = () => {
    const blocks = selectedBlocks();
    if (blocks.length) localStorage.setItem(CLIP_KEY, JSON.stringify(blocks));
  };
  const cutSelected = () => {
    copySelected();
    removeSelected();
  };
  const paste = () => {
    const raw = localStorage.getItem(CLIP_KEY);
    if (!raw) return;
    try {
      const blocks = (JSON.parse(raw) as WidgetT[]).filter((b) => b && KNOWN.has(b.type as WidgetType));
      insertBlocksAfter(blocks.map(clone));
    } catch {
      /* invalid clipboard — ignore */
    }
  };

  const moveSelectedRow = (dir: "up" | "down") => {
    const id = primaryRef.current;
    if (!id) return;
    const i = docRef.current.rows.findIndex((r) => r.blocks.some((b) => b.id === id));
    const next = i < 0 ? null : moveRow(docRef.current, i, dir);
    if (next) commitDoc(next);
  };

  const performDrop = (source: { kind: "existing"; id: string } | { kind: "new"; type: WidgetType }, target: DropTarget) => {
    const doc = docRef.current;
    let block, rowHeight: number;
    if (source.kind === "new") {
      block = makeBlock(source.type);
      rowHeight = blockFor(source.type).defaultH;
    } else {
      block = doc.rows.flatMap((r) => r.blocks).find((b) => b.id === source.id);
      if (!block) return;
      const srcRow = doc.rows.find((r) => r.blocks.some((b) => b.id === source.id))!;
      rowHeight = srcRow.blocks.length === 1 ? srcRow.h : blockFor(block.type).defaultH;
    }
    const next = applyDrop(doc, block, target, source.kind === "existing" ? source.id : undefined, rowHeight);
    if (!next) return;
    commitDoc(next);
    dispatch({ type: "select", id: block.id });
  };

  const insertBlock = (type: WidgetType, rowIndex: number, edit = false): string | null => {
    const block = makeBlock(type);
    const next = applyDrop(docRef.current, block, { kind: "row", index: rowIndex }, undefined, blockFor(type).defaultH);
    if (!next) return null;
    commitDoc(next);
    dispatch({ type: "select", id: block.id });
    if (edit && TEXT_PROP[type]) setEditing({ id: block.id, prop: TEXT_PROP[type]!, multiline: !SINGLE_LINE.has(type) });
    return block.id;
  };

  const startEditing = (id: string) => {
    const block = docRef.current.rows.flatMap((r) => r.blocks).find((b) => b.id === id);
    const prop = block && TEXT_PROP[block.type];
    if (prop) setEditing({ id, prop, multiline: !SINGLE_LINE.has(block!.type) });
  };

  // Change a block's type in place (the toolbar's ⤳), keeping id/width/style and
  // carrying the primary text across when both types have one.
  const convertBlock = (id: string, type: WidgetType) => {
    setConvertId(null);
    const doc = structuredClone(docRef.current);
    for (const r of doc.rows) {
      const i = r.blocks.findIndex((bl) => bl.id === id);
      if (i < 0) continue;
      const old = r.blocks[i]!;
      const fresh = makeBlock(type);
      const op = TEXT_PROP[old.type];
      const np = TEXT_PROP[type];
      if (op && np) (fresh.props as Record<string, unknown>)[np] = (old.props as Record<string, unknown>)[op];
      r.blocks[i] = { ...fresh, id: old.id, width: old.width, style: old.style } as WidgetT;
      break;
    }
    commitDoc(doc);
    dispatch({ type: "select", id });
    if (TEXT_PROP[type]) setEditing({ id, prop: TEXT_PROP[type]!, multiline: !SINGLE_LINE.has(type) });
  };

  // Close the toolbar's popovers whenever the selection changes.
  const selectedKey = state.selectedIds.length === 1 ? state.selectedIds[0]! : "";
  useEffect(() => {
    setOptionsOpen(false);
    setConvertId(null);
  }, [selectedKey]);

  // Just start typing — like Notion. A printable key with a text block selected
  // appends to it and opens the editor; on a blank board it births a text line.
  const appendChar = (id: string, prop: string, ch: string) => {
    stageEdit((d) => {
      const blk = d.rows.flatMap((r) => r.blocks).find((b) => b.id === id);
      if (blk) {
        const cur = String((blk.props as Record<string, unknown>)[prop] ?? "");
        (blk.props as Record<string, unknown>)[prop] = cur + ch;
      }
    });
    startEditing(id);
  };
  const typeChar = (ch: string): boolean => {
    const id = primaryRef.current;
    const block = id ? docRef.current.rows.flatMap((r) => r.blocks).find((b) => b.id === id) : undefined;
    const prop = block && TEXT_PROP[block.type];
    if (id && prop) {
      appendChar(id, prop, ch);
      return true;
    }
    if (docRef.current.rows.length === 0) {
      const newId = insertBlock("text", 0);
      if (newId) appendChar(newId, "content", ch);
      return true;
    }
    return false;
  };

  // Backspace on an empty line: drop it and put the cursor at the line above.
  const deleteAndFocusPrev = (id: string) => {
    const all = docRef.current.rows.flatMap((r) => r.blocks);
    const idx = all.findIndex((b) => b.id === id);
    const prev = idx > 0 ? all[idx - 1] : undefined;
    setEditing(null);
    commitDoc(removeBlocks(docRef.current, new Set([id])));
    if (prev) {
      const p = TEXT_PROP[prev.type];
      if (p) setEditing({ id: prev.id, prop: p, multiline: !SINGLE_LINE.has(prev.type) });
      else dispatch({ type: "select", id: prev.id });
    }
  };

  // A fresh board opens with a heading on the first line, cursor ready — type
  // a title and keep going, like a new note. (Notion's "Untitled" line.)
  const initedRef = useRef(false);
  useEffect(() => {
    if (loaded && !initedRef.current) {
      initedRef.current = true;
      if (docRef.current.rows.length === 0) insertBlock("heading", 0, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const openSlash = (index?: number) => {
    if (index !== undefined) {
      setSlashRow(index);
      return;
    }
    const sel = docRef.current.rows.findIndex((r) => r.blocks.some((b) => b.id === primaryRef.current));
    setSlashRow(sel === -1 ? docRef.current.rows.length : sel + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      const meta = e.metaKey || e.ctrlKey;
      const o = overlayRef.current;
      const has = selectedRef.current.length > 0;
      const pid = primaryRef.current;
      const pblock = pid ? docRef.current.rows.flatMap((r) => r.blocks).find((b) => b.id === pid) : undefined;
      const canType = (!!pblock && TEXT_PROP[pblock.type] !== undefined) || docRef.current.rows.length === 0;

      if (o.presenting) {
        if (e.key === "Escape") setPresenting(false);
        return;
      }
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if (meta && e.key.toLowerCase() === "c") {
        copySelected();
      } else if (meta && e.key.toLowerCase() === "x") {
        e.preventDefault();
        cutSelected();
      } else if (meta && e.key.toLowerCase() === "v") {
        paste();
      } else if (meta && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        moveSelectedRow(e.key === "ArrowUp" ? "up" : "down");
      } else if (e.key === "/") {
        e.preventDefault();
        openSlash();
      } else if (!meta && e.key.length === 1 && canType) {
        // type-first: a printable key starts editing the selected text block
        // (so "p" and "?" type into text instead of firing global shortcuts)
        e.preventDefault();
        typeChar(e.key);
      } else if (e.key === "?") {
        e.preventDefault();
        setShowHelp((v) => !v);
      } else if (e.key === "p" && !meta) {
        e.preventDefault();
        setPresenting(true);
      } else if (e.key === "Enter" && has) {
        e.preventDefault();
        if (primaryRef.current) startEditing(primaryRef.current);
      } else if ((e.key === "Delete" || e.key === "Backspace") && has) {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape") {
        if (o.showHelp) setShowHelp(false);
        else if (o.popover) { setOptionsOpen(false); setConvertId(null); }
        else if (o.slashOpen) setSlashRow(null);
        else dispatch({ type: "select", id: null });
      } else if (e.key.startsWith("Arrow") && primaryRef.current) {
        e.preventDefault();
        const dir = e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : e.key === "ArrowLeft" ? "left" : "right";
        const next = moveBlock(docRef.current, primaryRef.current, dir);
        if (next) commitDoc(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (missing) {
    return (
      <main class="shell">
        <p class="issues">That setup doesn't exist (or isn't yours).</p>
        <a href="#/setups">← Back to setups</a>
      </main>
    );
  }

  const primary = primaryId(state);
  const slashPos =
    slashRow !== null
      ? (() => {
          const b = indicatorBox(geometry, { kind: "row", index: slashRow });
          return { x: Math.min(Math.max(8, b.x * scale), Math.max(8, W * scale - 280)), y: Math.min(Math.max(8, b.y * scale), Math.max(8, H * scale - 360)) };
        })()
      : null;

  const editBox = editing ? geometry.blocks.find((b) => b.id === editing.id) : undefined;
  const editValue = editing
    ? String(((docRef.current.rows.flatMap((r) => r.blocks).find((b) => b.id === editing.id)?.props ?? {}) as Record<string, unknown>)[editing.prop] ?? "")
    : "";
  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : "";

  // The floating block toolbar + its popovers anchor to the single selected block.
  const stageW = W * scale;
  const stageH = H * scale;
  const singleSel = state.selectedIds.length === 1;
  const primaryBlock = primary ? state.present.rows.flatMap((r) => r.blocks).find((b) => b.id === primary) : undefined;
  const primaryBox = primary ? geometry.blocks.find((b) => b.id === primary) : undefined;
  const optionsPos = primaryBox
    ? { x: Math.min(Math.max(8, primaryBox.x * scale), Math.max(8, stageW - 312)), y: Math.min(Math.max(8, primaryBox.y * scale + (primaryBox.y * scale < 60 ? 44 : -8)), Math.max(8, stageH - 392)) }
    : null;
  const convertPos = primaryBox
    ? { x: Math.min(Math.max(8, primaryBox.x * scale), Math.max(8, stageW - 280)), y: Math.min(Math.max(8, primaryBox.y * scale + 28), Math.max(8, stageH - 360)) }
    : null;

  return (
    <div class="studio">
      <header class="studio-bar">
        <a class="back" href="#/">← Screens</a>
        <input class="title-input" value={state.present.name} onInput={(e) => stageEdit((d) => { d.name = (e.currentTarget as HTMLInputElement).value || "Untitled"; })} />
        {saveLabel && <span class={`chip save-${saveState}`}>{saveLabel}</span>}
        <span class="spacer" />
        <span class="muted hide-narrow">{liveOn > 0 ? `Live on ${liveOn}` : "Not attached"}</span>
        <select value={sizeKey} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setSizeKey(v); localStorage.setItem(SIZE_KEY, v); }}>
          {Object.keys(SIZES).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={String(zoom)} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setZoom(v === "null" ? null : Number(v)); }} title="Zoom">
          {ZOOMS.map((z) => <option key={z.label} value={String(z.value)}>{z.label}</option>)}
        </select>
        <button class="ghost" disabled={state.past.length === 0} title="Undo (⌘Z)" onClick={() => dispatch({ type: "undo" })}>↶</button>
        <button class="ghost" disabled={state.future.length === 0} title="Redo (⇧⌘Z)" onClick={() => dispatch({ type: "redo" })}>↷</button>
        <button class="ghost" title="Keyboard shortcuts (?)" onClick={() => setShowHelp(true)}>?</button>
        <button class="ghost" title="Present (P)" onClick={() => setPresenting(true)}>▶</button>
        <button onClick={() => openSlash()}>+ Block</button>
      </header>
      {saveState === "error" && saveError && <p class="issues studio-issues">{saveError}</p>}
      <div class="studio-body">
        <div class={`stage-pane${zoom ? " zoomed" : ""}`} ref={paneRef}>
          <PreviewStage W={W} H={H} scale={scale} doc={state.present} data={data} stageRef={stageRef}>
            <div class="drag-halo" ref={haloRef} />
            <Overlay
              doc={state.present}
              geometry={geometry}
              scale={scale}
              selectedIds={state.selectedIds}
              docRef={docRef}
              dispatch={dispatch}
              dragLayer={dragLayer}
              onDrop={(id, target) => performDrop({ kind: "existing", id }, target)}
              onEdit={startEditing}
              onInsertTextAt={(rowIndex) => insertBlock("text", rowIndex, true)}
            />
            {state.present.rows.length === 0 && !editing && (
              <div class="empty-hint">Start typing — or press <kbd>/</kbd> for blocks</div>
            )}
            <div class="drop-indicator" ref={indicatorRef} />
            {editBox && editing && (
              <textarea
                ref={editRef}
                key={editing.id}
                class="inline-edit"
                style={{ left: `${editBox.x * scale}px`, top: `${editBox.y * scale}px`, width: `${editBox.w * scale}px`, height: `${editBox.h * scale}px` }}
                value={editValue}
                onInput={(e) => {
                  const v = (e.currentTarget as HTMLTextAreaElement).value;
                  stageEdit((d) => {
                    const blk = d.rows.flatMap((r) => r.blocks).find((b) => b.id === editing.id);
                    if (blk) (blk.props as Record<string, unknown>)[editing.prop] = v;
                  });
                }}
                onKeyDown={(e) => {
                  const ta = e.currentTarget as HTMLTextAreaElement;
                  const type = docRef.current.rows.flatMap((r) => r.blocks).find((b) => b.id === editing.id)?.type;
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setEditing(null);
                  } else if (e.key === "Enter" && !e.shiftKey && type && ENTER_BREAKS.has(type)) {
                    // type a document: Enter starts a fresh text line below (Shift+Enter = newline)
                    e.preventDefault();
                    const rowIndex = docRef.current.rows.findIndex((r) => r.blocks.some((b) => b.id === editing.id));
                    setEditing(null);
                    insertBlock("text", rowIndex + 1, true);
                  } else if (e.key === "Backspace" && ta.value === "") {
                    // backspace on an empty line removes it and jumps to the line above
                    e.preventDefault();
                    deleteAndFocusPrev(editing.id);
                  }
                }}
                onBlur={() => setEditing(null)}
              />
            )}
            {singleSel && primaryBox && primaryBlock && !presenting && slashRow === null && (
              <BlockToolbar
                box={primaryBox}
                scale={scale}
                stageW={stageW}
                canEdit={TEXT_PROP[primaryBlock.type] !== undefined}
                canBind={false}
                bound={false}
                onEdit={() => primary && startEditing(primary)}
                onConvert={() => { setOptionsOpen(false); setConvertId(primary); }}
                onData={() => {}}
                onOptions={() => { setConvertId(null); setOptionsOpen((v) => !v); }}
                onDelete={removeSelected}
              />
            )}
            {optionsOpen && optionsPos && primaryBlock && (
              <>
                <div class="popover-backdrop" onPointerDown={() => setOptionsOpen(false)} />
                <div class="block-popover" style={{ left: `${optionsPos.x}px`, top: `${optionsPos.y}px` }} onPointerDown={(e) => (e as unknown as Event).stopPropagation()}>
                  <BlockFields block={primaryBlock} stageEdit={stageEdit} />
                </div>
              </>
            )}
            {convertId && convertPos && (
              <SlashMenu at={convertPos} onClose={() => setConvertId(null)} onInsert={(type) => convertBlock(convertId, type)} />
            )}
            {slashPos && slashRow !== null && (
              <SlashMenu
                at={slashPos}
                onClose={() => setSlashRow(null)}
                onInsert={(type) => {
                  const row = slashRow;
                  setSlashRow(null);
                  insertBlock(type, row, true);
                }}
              />
            )}
          </PreviewStage>
        </div>
        <aside class="studio-side">
          <Palette
            stageRef={stageRef}
            geometry={geometry}
            scale={scale}
            docRef={docRef}
            dragLayer={dragLayer}
            onDrop={(type, target) => performDrop({ kind: "new", type }, target)}
            onClickInsert={(type) => insertBlock(type, docRef.current.rows.length, !!TEXT_PROP[type])}
          />
          <BoardSettings doc={state.present} commitDoc={commitDoc} />
        </aside>
      </div>
      <div class="drag-chip" ref={ghostRef} />
      {presenting && <Present doc={state.present} data={data} W={W} H={H} onClose={() => setPresenting(false)} />}
      {showHelp && <Shortcuts onClose={() => setShowHelp(false)} />}
    </div>
  );
}
