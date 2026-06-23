import { Layout, type LayoutT, type WidgetT } from "@glanceos/schema";
import { useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import { api, type DeviceSummary, type LayoutRecord } from "../api";
import { editorOrigin } from "../router";
import { BINDABLE, BLOCKS, blockFor, ENTER_BREAKS, INPLACE_EDIT, makeBlock, newWidgetId, SINGLE_LINE, TEXT_PROP, type WidgetType } from "./blocks";
import { DataPanel } from "./databind";
import {
  applyDrop, indicatorBox, moveBlock, moveRow, pageGeometry, removeBlocks, type DropTarget,
} from "./geometry";
import { ListEditor } from "./listEditor";
import { Overlay } from "./overlay";
import { Palette } from "./palette";
import { Present } from "./present";
import { castBoard, castConfigured } from "../cast";
import { encodeQR, qrSvg } from "../qr";
import { PreviewStage } from "./preview";
import { createPortal } from "preact/compat";
import { Modal } from "../components/Modal";
import { LAYOUTS, applyLayout, type LayoutPreset } from "./layouts";
import { AutomationsPage, type ObjOption } from "../pages/automations";
import { BlockFields, BoardSettings, ObjectsPanel } from "./properties";
import { Shortcuts } from "./shortcuts";
import { SlashMenu } from "./slash-menu";
import { TableEditor } from "./tableEditor";
import { BlockMenu } from "./toolbar";
import { Icon } from "./icons";
import { editorReducer, initialEditor, primaryId } from "./state";

// Block types that get the structured per-line list editor instead of a textarea.
const LIST_EDIT = new Set<WidgetType>(["bulletList", "numberedList", "checklist", "steps"]);

interface ScreenPreset { id: string; label: string; w: number; h: number; category: string }
const SIZE_CATEGORIES = ["TV", "Monitor", "Laptop", "Tablet", "Phone", "E-Paper", "Signage"];
const SIZES: ScreenPreset[] = [
  { id: "tv-720p", label: "720p TV", w: 1280, h: 720, category: "TV" },
  { id: "tv-1080p", label: "1080p TV (16:9)", w: 1920, h: 1080, category: "TV" },
  { id: "tv-1440p", label: "1440p TV (16:9)", w: 2560, h: 1440, category: "TV" },
  { id: "tv-4k", label: "4K UHD TV", w: 3840, h: 2160, category: "TV" },
  { id: "tv-1080p-portrait", label: "1080p TV (Portrait)", w: 1080, h: 1920, category: "TV" },
  { id: "tv-4k-portrait", label: "4K UHD TV (Portrait)", w: 2160, h: 3840, category: "TV" },
  { id: "monitor-1080p", label: "1080p Monitor", w: 1920, h: 1080, category: "Monitor" },
  { id: "monitor-1200p", label: "1200p (16:10)", w: 1920, h: 1200, category: "Monitor" },
  { id: "monitor-1440p", label: "1440p (QHD)", w: 2560, h: 1440, category: "Monitor" },
  { id: "monitor-1600p", label: "1600p (16:10)", w: 2560, h: 1600, category: "Monitor" },
  { id: "monitor-4k", label: "4K Monitor", w: 3840, h: 2160, category: "Monitor" },
  { id: "monitor-uw-1440", label: "Ultrawide 1440p (21:9)", w: 3440, h: 1440, category: "Monitor" },
  { id: "monitor-uw-2160", label: "Ultrawide 4K (21:9)", w: 5120, h: 2160, category: "Monitor" },
  { id: "monitor-square", label: "Square 1440", w: 1440, h: 1440, category: "Monitor" },
  { id: "laptop-1280", label: "Laptop 1280×800", w: 1280, h: 800, category: "Laptop" },
  { id: "laptop-1366", label: "Laptop 1366×768 (HD)", w: 1366, h: 768, category: "Laptop" },
  { id: "laptop-1440", label: "Laptop 1440×900", w: 1440, h: 900, category: "Laptop" },
  { id: "laptop-mba-13", label: 'MacBook Air 13"', w: 1280, h: 832, category: "Laptop" },
  { id: "laptop-mbp-14", label: 'MacBook Pro 14"', w: 1512, h: 982, category: "Laptop" },
  { id: "laptop-mbp-16", label: 'MacBook Pro 16"', w: 1728, h: 1117, category: "Laptop" },
  { id: "ipad-pro-land", label: 'iPad Pro 12.9" (Landscape)', w: 2048, h: 1536, category: "Tablet" },
  { id: "ipad-pro-port", label: 'iPad Pro 12.9" (Portrait)', w: 1536, h: 2048, category: "Tablet" },
  { id: "ipad-air-land", label: 'iPad Air (Landscape)', w: 1640, h: 1080, category: "Tablet" },
  { id: "ipad-air-port", label: 'iPad Air (Portrait)', w: 1080, h: 1640, category: "Tablet" },
  { id: "ipad-mini-port", label: 'iPad mini (Portrait)', w: 1024, h: 1488, category: "Tablet" },
  { id: "android-tab-land", label: "Android Tablet (Landscape)", w: 2560, h: 1600, category: "Tablet" },
  { id: "android-tab-port", label: "Android Tablet (Portrait)", w: 1600, h: 2560, category: "Tablet" },
  { id: "iphone-15-pro", label: "iPhone 15 Pro", w: 1179, h: 2556, category: "Phone" },
  { id: "iphone-14", label: "iPhone 14", w: 1170, h: 2532, category: "Phone" },
  { id: "iphone-se", label: "iPhone SE", w: 750, h: 1334, category: "Phone" },
  { id: "galaxy-s24", label: "Samsung Galaxy S24", w: 1080, h: 2340, category: "Phone" },
  { id: "pixel-8", label: "Google Pixel 8", w: 1080, h: 2400, category: "Phone" },
  { id: "eink-trmnl", label: "TRMNL (Landscape)", w: 800, h: 480, category: "E-Paper" },
  { id: "eink-paperwhite", label: "Kindle Paperwhite", w: 1072, h: 1448, category: "E-Paper" },
  { id: "eink-scribe", label: "Kindle Scribe", w: 1200, h: 1600, category: "E-Paper" },
  { id: "eink-inky-73", label: 'Inky Impression 7.3"', w: 800, h: 480, category: "E-Paper" },
  { id: "eink-ws-75", label: 'Waveshare 7.5"', w: 800, h: 480, category: "E-Paper" },
  { id: "eink-ws-103", label: 'Waveshare 10.3"', w: 1872, h: 1404, category: "E-Paper" },
  { id: "signage-vertical", label: "Vertical Signage (9:16)", w: 1080, h: 1920, category: "Signage" },
];
const SIZES_BY_ID: Record<string, [number, number]> = Object.fromEntries(SIZES.map((s) => [s.id, [s.w, s.h]]));
const SIZE_LABEL: Record<string, string> = Object.fromEntries(SIZES.map((s) => [s.id, s.label]));
const SIZES_LEGACY: Record<string, string> = { "1920×1080": "tv-1080p", "1280×800": "laptop-1280", "800×480": "eink-trmnl", "1080×1920": "tv-1080p-portrait" };
const SIZE_KEY = "glanceos.previewSize";
const SIDEBAR_PIN_KEY = "glanceos.sidebarPinned";
const CLIP_KEY = "glanceos.clipboard";
const ZOOMS: Array<{ label: string; value: number | null }> = [
  { label: "Fit", value: null },
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1 },
  { label: "125%", value: 1.25 },
];

const PLACEHOLDER: LayoutT = { schemaVersion: 3, name: "Loading…", theme: { mode: "light", fontScale: "m" }, gap: 2, align: "top", rows: [] };
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

// Every object on a board carries a unique, human-editable name (shown in the
// Objects panel + used to target it from automations). New/unnamed blocks get an
// auto name from their type ("Clock", "Clock 2"); user-set names are preserved.
// Runs on every committed edit — idempotent once everything is named.
function autoNameObjects(doc: LayoutT): void {
  const blocks = doc.rows.flatMap((r) => r.blocks);
  if (blocks.every((b) => b.name)) return; // fast path: nothing to name
  const taken = new Set<string>();
  for (const b of blocks) if (b.name) taken.add(b.name.toLowerCase());
  for (const b of blocks) {
    if (b.name) continue;
    const base = blockFor(b.type).label;
    let nm = base;
    for (let n = 2; taken.has(nm.toLowerCase()); n++) nm = `${base} ${n}`;
    b.name = nm;
    taken.add(nm.toLowerCase());
  }
}

export function Studio({ layoutId }: { layoutId: number }) {
  const [state, dispatch] = useReducer(editorReducer, PLACEHOLDER, initialEditor);
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [displayOpen, setDisplayOpen] = useState(false);
  const liveOn = devices.filter((d) => d.layoutId === layoutId).length;
  const [sizeKey, setSizeKey] = useState(() => {
    const s = localStorage.getItem(SIZE_KEY);
    if (s && SIZES_BY_ID[s]) return s;
    if (s && SIZES_LEGACY[s]) { localStorage.setItem(SIZE_KEY, SIZES_LEGACY[s]!); return SIZES_LEGACY[s]!; }
    return "tv-1080p";
  });
  const [zoom, setZoom] = useState<number | null>(null);
  const [slashRow, setSlashRow] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [keepContent, setKeepContent] = useState(true);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareDays, setShareDays] = useState(0); // 0 = never
  const [sharePw, setSharePw] = useState("");
  const [canCast, setCanCast] = useState(false);
  const [castMsg, setCastMsg] = useState("");
  const [convertId, setConvertId] = useState<string | null>(null);
  // The block whose ⠿-handle menu is open (Notion-style: click handle → menu).
  const [menuId, setMenuId] = useState<string | null>(null);
  // The blocks panel is always docked (no floating mode); the top-bar button
  // just shows/hides it. Remembers the last shown/hidden choice.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const s = localStorage.getItem(SIDEBAR_PIN_KEY);
    return s ? (JSON.parse(s) as boolean) : true;
  });
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [objectsOpen, setObjectsOpen] = useState(false);
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
  const overlayRef = useRef({ presenting, showHelp, slashOpen: slashRow !== null, editing: !!editing, popover: false, menuOpen: false });
  overlayRef.current = { presenting, showHelp, slashOpen: slashRow !== null, editing: !!editing, popover: optionsOpen || dataOpen || convertId !== null, menuOpen: menuId !== null };
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
        if (!g) return;
        g.innerHTML = "";
        const lb = document.createElement("span");
        lb.className = "drag-card-label";
        lb.textContent = label;
        g.append(lb);
        g.style.display = "flex";
      },
      move(x, y) {
        const g = ghostRef.current;
        if (g) g.style.transform = `translate(${x - g.offsetWidth / 2}px, ${y - g.offsetHeight - 12}px)`;
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

  useEffect(() => { castConfigured().then(setCanCast).catch(() => {}); }, []);

  useEffect(() => {
    api.get<LayoutRecord>(`/api/layouts/${layoutId}`).then(
      (record) => {
        lastSavedRef.current = JSON.stringify(record.document);
        dispatch({ type: "replace", doc: record.document });
        setLoaded(true);
      },
      () => setMissing(true),
    );
    api.get<DeviceSummary[]>("/api/devices").then(setDevices).catch(() => {});
  }, [layoutId]);

  const refreshDevices = () => api.get<DeviceSummary[]>("/api/devices").then(setDevices).catch(() => {});
  const toggleDisplayOn = async (device: DeviceSummary) => {
    const on = device.layoutId === layoutId;
    await api.patch(`/api/devices/${device.id}`, { layoutId: on ? null : layoutId }).catch(() => {});
    await refreshDevices();
  };

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const obs = new ResizeObserver(() => setPaneSize({ w: pane.clientWidth - 32, h: pane.clientHeight - 32 }));
    obs.observe(pane);
    return () => obs.disconnect();
  }, []);

  const [W, H] = SIZES_BY_ID[sizeKey] ?? [1920, 1080];
  const fitScale = Math.min(paneSize.w / W, paneSize.h / H);
  const scale = zoom ?? fitScale;
  const geometry = useMemo(() => pageGeometry(state.present, W, H), [state.present, W, H]);

  // Persist the current doc now (shared by autosave + the error-banner Retry).
  const saveNow = async () => {
    const parsed = Layout.safeParse(docRef.current);
    if (!parsed.success) {
      setSaveState("error");
      setSaveError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      return;
    }
    setSaveState("saving");
    try {
      await api.put(`/api/layouts/${layoutId}`, { document: parsed.data });
      lastSavedRef.current = JSON.stringify(docRef.current);
      setSaveState("saved");
      setSaveError("");
    } catch (e) {
      setSaveState("error");
      setSaveError(String(e instanceof Error ? e.message : e));
    }
  };

  // autosave (debounced)
  useEffect(() => {
    if (!loaded || state.gestureBase) return;
    if (JSON.stringify(state.present) === lastSavedRef.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(saveNow, 1000);
    return () => window.clearTimeout(timer);
  }, [state.present, state.gestureBase, loaded, layoutId]);

  // preview data (structure excluded so drags cost no server calls)
  const dataKey = useMemo(
    () => JSON.stringify(state.present.rows.flatMap((r) => r.blocks).map((b) => [b.id, b.type, b.props, b.source])),
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

  const commitDoc = (doc: LayoutT) => { autoNameObjects(doc); dispatch({ type: "commit", doc }); };

  const stageEdit = (mutate: (d: LayoutT) => void) => {
    dispatch({ type: "gestureStart" });
    const doc = structuredClone(docRef.current);
    mutate(doc);
    autoNameObjects(doc); // every object carries a unique, editable name (used by automations)
    dispatch({ type: "gestureUpdate", doc });
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => dispatch({ type: "gestureEnd" }), 500);
  };

  const selectedBlocks = (): WidgetT[] => {
    const ids = new Set(selectedRef.current);
    return docRef.current.rows.flatMap((r) => r.blocks).filter((b) => ids.has(b.id));
  };

  // Apply a "choose your layout" preset: rearrange the board into that rows×columns shape,
  // optionally pouring the existing blocks into its cells (one undo step via stageEdit).
  const applyPreset = (preset: LayoutPreset) => {
    const hasContent = docRef.current.rows.some((r) => r.blocks.length > 0);
    stageEdit((d) => { d.rows = applyLayout(d, preset, keepContent && hasContent); });
    setLayoutOpen(false);
    dispatch({ type: "select", id: null });
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
  // v9.0 paint-format: copy the primary block's style, paste it onto every selected block.
  const copyStyle = () => {
    const id = primaryRef.current;
    const b = id ? docRef.current.rows.flatMap((r) => r.blocks).find((x) => x.id === id) : null;
    if (b) localStorage.setItem("glanceos.copiedStyle", JSON.stringify(b.style ?? {}));
  };
  const pasteStyle = () => {
    const raw = localStorage.getItem("glanceos.copiedStyle");
    if (!raw || !selectedRef.current.length) return;
    let st: object;
    try { st = JSON.parse(raw) as object; } catch { return; }
    const ids = new Set(selectedRef.current);
    stageEdit((d) => { for (const r of d.rows) for (const blk of r.blocks) if (ids.has(blk.id)) blk.style = { ...st } as typeof blk.style; });
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
  // Close the side popovers when the selection changes. NOT menuId — the handle
  // click both selects and opens the menu; the `menuId === primary` render gate
  // already hides a menu left over on a different block.
  useEffect(() => {
    setOptionsOpen(false);
    setDataOpen(false);
    setConvertId(null);
  }, [selectedKey]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_PIN_KEY, JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);

  // Point a block at (or unbind it from) a live data source.
  const setSource = (id: string, src: unknown) =>
    stageEdit((d) => {
      const t = d.rows.flatMap((r) => r.blocks).find((b) => b.id === id);
      if (!t) return;
      if (src) (t as unknown as { source: unknown }).source = src;
      else delete (t as unknown as { source?: unknown }).source;
    });

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
  // Birth a fresh text line carrying the first character, in ONE commit, and
  // open it for editing. (Insert-then-append would race: the append re-reads a
  // docRef that hasn't seen the insert yet and would clobber it.)
  const insertTextWith = (rowIndex: number, ch: string) => {
    const block = makeBlock("text");
    (block.props as Record<string, unknown>).content = ch;
    const next = applyDrop(docRef.current, block, { kind: "row", index: rowIndex }, undefined, blockFor("text").defaultH);
    if (!next) return;
    commitDoc(next);
    dispatch({ type: "select", id: block.id });
    setEditing({ id: block.id, prop: "content", multiline: true });
  };
  const typeChar = (ch: string): boolean => {
    const id = primaryRef.current;
    const block = id ? docRef.current.rows.flatMap((r) => r.blocks).find((b) => b.id === id) : undefined;
    const prop = block && TEXT_PROP[block.type];
    // a text block is focused → keep typing into it
    if (id && prop) {
      appendChar(id, prop, ch);
      return true;
    }
    // nothing focused on a non-empty board → continue the trailing text line.
    const all = docRef.current.rows.flatMap((r) => r.blocks);
    const last = all[all.length - 1];
    const lastProp = last && TEXT_PROP[last.type];
    if (last && lastProp) {
      appendChar(last.id, lastProp, ch);
      dispatch({ type: "select", id: last.id });
      return true;
    }
    // empty board, or the last block isn't text → start a new text line. Text is
    // part of the document, never an inserted "object".
    insertTextWith(docRef.current.rows.length, ch);
    return true;
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
      } else if (meta && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copyStyle();
      } else if (meta && e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteStyle();
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
      } else if (!meta && e.key.length === 1) {
        // type-first, exactly like a document: any printable key types into the
        // focused text line, the trailing line, or a fresh one. Text is never an
        // inserted object. ("/" is handled above; present & help are buttons.)
        e.preventDefault();
        typeChar(e.key);
      } else if (e.key === "Enter" && has) {
        e.preventDefault();
        if (primaryRef.current) startEditing(primaryRef.current);
      } else if ((e.key === "Delete" || e.key === "Backspace") && has) {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape") {
        if (o.showHelp) setShowHelp(false);
        else if (o.menuOpen) setMenuId(null);
        else if (o.popover) { setOptionsOpen(false); setDataOpen(false); setConvertId(null); }
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
  const editingBlock = editing ? state.present.rows.flatMap((r) => r.blocks).find((b) => b.id === editing.id) : undefined;
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

  // The docked blocks panel, simply shown or hidden from the top bar.
  const sideShown = sidebarOpen;
  const toggleSidebar = () => setSidebarOpen((v) => !v);

  const openShare = () => {
    setShareOpen(true); setShareCopied(false);
    api.get<{ token: string | null; url: string | null }>(`/api/layouts/${layoutId}/share`).then((r) => setShareUrl(r.url)).catch(() => {});
  };
  const createShare = async () => {
    setShareBusy(true);
    try {
      const r = await api.post<{ url: string }>(`/api/layouts/${layoutId}/share`, { expiresInDays: shareDays || null, password: sharePw || null });
      setShareUrl(r.url);
      setSharePw("");
    } catch { /* keep popover open */ } finally { setShareBusy(false); }
  };
  const revokeShare = async () => {
    setShareBusy(true);
    try { await api.del(`/api/layouts/${layoutId}/share`); setShareUrl(null); setShareCopied(false); } catch { /* noop */ } finally { setShareBusy(false); }
  };
  const copyShare = () => {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl).then(() => setShareCopied(true)).catch(() => {});
  };
  const doCast = async () => {
    if (!shareUrl) return;
    setCastMsg("");
    try {
      // Share link is now /s/:token (was /screen/?share=token) — accept either form.
      const u = new URL(shareUrl);
      const token = u.searchParams.get("share") || u.pathname.split("/").filter(Boolean).pop() || null;
      if (token) await castBoard(token);
    } catch (e) { setCastMsg(String(e instanceof Error ? e.message : e)); }
  };

  return (
    <div class="studio">
      <header class="studio-bar">
        <nav class="studio-crumbs" aria-label="Breadcrumb">
          <a class="back" href={editorOrigin().path} title={`Back to ${editorOrigin().label}`}>← {editorOrigin().label}</a>
          <span class="crumb-sep" aria-hidden="true">/</span>
          <input class="title-input crumb-current" aria-label="Board name" value={state.present.name} onInput={(e) => stageEdit((d) => { d.name = (e.currentTarget as HTMLInputElement).value || "Untitled"; })} />
        </nav>
        {saveLabel && (
          <span class={`chip save-chip save-${saveState}`}>
            {saveState === "saving" ? <span class="save-spinner" aria-hidden="true" />
              : saveState === "saved" ? <Icon.check />
                : saveState === "error" ? <Icon.warning />
                  : null}
            <span>{saveLabel}</span>
          </span>
        )}
        <span class="spacer" />
        <button class={`ghost hide-narrow display-on-btn${displayOpen ? " on" : ""}`} title="Choose which screens show this board" onClick={() => { setDisplayOpen((v) => !v); if (!displayOpen) refreshDevices(); }}>
          <Icon.monitor /> {liveOn > 0 ? `Live on ${liveOn}` : "Show on…"}
        </button>
        <select class="size-select" title="Screen size" value={sizeKey} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setSizeKey(v); localStorage.setItem(SIZE_KEY, v); }}>
          {SIZE_CATEGORIES.map((cat) => (
            <optgroup key={cat} label={cat}>
              {SIZES.filter((s) => s.category === cat).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </optgroup>
          ))}
        </select>
        <select value={String(zoom)} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setZoom(v === "null" ? null : Number(v)); }} title="Zoom">
          {ZOOMS.map((z) => <option key={z.label} value={String(z.value)}>{z.label}</option>)}
        </select>
        <button class={`ghost hide-narrow${layoutOpen ? " on" : ""}`} title="Choose a layout for this board" onClick={() => setLayoutOpen(true)}><Icon.grid /> Layout</button>
        <button class="ghost icon-btn" disabled={state.past.length === 0} aria-label="Undo" title="Undo (⌘Z)" onClick={() => dispatch({ type: "undo" })}><Icon.undo /></button>
        <button class="ghost icon-btn" disabled={state.future.length === 0} aria-label="Redo" title="Redo (⇧⌘Z)" onClick={() => dispatch({ type: "redo" })}><Icon.redo /></button>
        <button class="ghost icon-btn" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onClick={() => setShowHelp(true)}><Icon.help /></button>
        <button class="ghost icon-btn" aria-label="Present" title="Present" onClick={() => setPresenting(true)}><Icon.play /></button>
        <button class={`ghost icon-btn${autoOpen ? " on" : ""}`} aria-label="Automations" title="Automations — make this board react" onClick={() => setAutoOpen(true)}><Icon.command /></button>
        <button class={`ghost icon-btn${shareOpen ? " on" : ""}`} aria-label="Share" title="Share" onClick={() => (shareOpen ? setShareOpen(false) : openShare())}><Icon.link /></button>
        <button class={`ghost icon-btn${sideShown ? " on" : ""}`} aria-label={sideShown ? "Hide blocks panel" : "Show blocks panel"} title={sideShown ? "Hide panel" : "Show blocks panel"} onClick={toggleSidebar}><Icon.panelToggle /></button>
      </header>
      {autoOpen && (
        <Modal open={autoOpen} onClose={() => setAutoOpen(false)} title="Automations" width={680}>
          <AutomationsPage
            embedded
            layoutId={layoutId}
            objects={state.present.rows.flatMap((r) => r.blocks).filter((b) => b.name).map((b): ObjOption => ({ id: b.id, name: b.name!, label: blockFor(b.type).label, type: b.type, settable: !b.source, prop: TEXT_PROP[b.type] }))}
          />
        </Modal>
      )}
      {layoutOpen && (
        <Modal open={layoutOpen} onClose={() => setLayoutOpen(false)} title="Choose a layout" width={640}>
          <p class="muted layout-intro">Arrange this board into sections. Pick a layout, then click any cell to fill it in.</p>
          {state.present.rows.some((r) => r.blocks.length > 0) && (
            <label class="layout-keep">
              <input type="checkbox" checked={keepContent} onChange={(e) => setKeepContent((e.currentTarget as HTMLInputElement).checked)} />
              <span>Keep my content (flow existing objects into the new sections)</span>
            </label>
          )}
          <div class="layout-gallery">
            {LAYOUTS.map((p) => (
              <button key={p.id} class="layout-card" title={`Apply “${p.name}”`} onClick={() => applyPreset(p)}>
                <div class="layout-thumb">
                  {p.rows.map((r, i) => (
                    <div key={i} class="lt-row" style={{ flexGrow: r.h }}>
                      {r.cells.map((c, j) => <div key={j} class="lt-cell" style={{ flexGrow: c.width ?? 1 }} />)}
                    </div>
                  ))}
                </div>
                <span class="layout-card-name">{p.name}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {shareOpen && createPortal(
        <>
          <div class="popover-backdrop" onPointerDown={() => setShareOpen(false)} />
          <div class="share-popover card" role="dialog" aria-label="Share board">
            <h3>Share this board</h3>
            {shareUrl ? (
              <>
                <p class="muted">Anyone with the link can view it live — no login needed.</p>
                <ShareQR url={shareUrl} />
                <input class="share-url" readOnly value={shareUrl} onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
                <div class="row spread share-actions">
                  <button class="ghost danger" onClick={revokeShare} disabled={shareBusy}>Turn off</button>
                  <span class="row share-right">
                    {canCast && <button class="ghost" onClick={doCast} title="Send this board to a Chromecast">Cast to TV</button>}
                    <a class="ghost" href={shareUrl} target="_blank" rel="noopener noreferrer">Open</a>
                    <button class="primary" onClick={copyShare}>{shareCopied ? "Copied ✓" : "Copy link"}</button>
                  </span>
                </div>
                {castMsg && <p class="muted" style={{ marginTop: "6px" }}>{castMsg}</p>}
              </>
            ) : (
              <>
                <p class="muted">Create a public, read-only link to this board.</p>
                <label class="field"><span>Link expires</span>
                  <select value={String(shareDays)} onChange={(e) => setShareDays(Number((e.currentTarget as HTMLSelectElement).value))}>
                    <option value="0">Never</option>
                    <option value="1">After 1 day</option>
                    <option value="7">After 7 days</option>
                    <option value="30">After 30 days</option>
                  </select>
                </label>
                <label class="field"><span>Password <em>(optional)</em></span>
                  <input type="text" value={sharePw} placeholder="No password" onInput={(e) => setSharePw((e.currentTarget as HTMLInputElement).value)} />
                </label>
                <div class="row spread" style={{ marginTop: "4px" }}>
                  <span />
                  <button class="primary" onClick={createShare} disabled={shareBusy}>{shareBusy ? "Creating…" : "Create link"}</button>
                </div>
              </>
            )}
          </div>
        </>,
        document.body,
      )}
      {displayOpen && createPortal(
        <>
          <div class="popover-backdrop" onPointerDown={() => setDisplayOpen(false)} />
          <div class="display-popover card" role="dialog" aria-label="Display on screens">
            <h3>Show this board on…</h3>
            {devices.length === 0 ? (
              <p class="muted">No screens connected yet.</p>
            ) : (
              <ul class="display-list">
                {devices.map((d) => (
                  <li key={d.id}>
                    <label class="display-row">
                      <input type="checkbox" checked={d.layoutId === layoutId} onChange={() => toggleDisplayOn(d)} />
                      <span class={d.online ? "dot online" : "dot"} aria-hidden="true" />
                      <span class="display-name">{d.name ?? "Unnamed screen"}</span>
                      {d.layoutId !== layoutId && d.layoutName && <span class="muted display-busy">{d.playlistId ? "playlist" : d.layoutName}</span>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p class="muted display-hint">Checking a screen sets it to show this board directly. Screens driven by a playlist or schedule aren't changed unless you check them.</p>
          </div>
        </>,
        document.body,
      )}
      {saveState === "error" && saveError && (
        <p class="issues studio-issues">
          <span>Couldn't save — {saveError}</span>
          <button class="ghost" onClick={saveNow}>Retry</button>
        </p>
      )}
      <div class="studio-body">
        <div class={`stage-pane${zoom ? " zoomed" : ""}`} ref={paneRef}>
          <PreviewStage W={W} H={H} scale={scale} doc={state.present} data={data} stageRef={stageRef} sizeLabel={SIZE_LABEL[sizeKey]}
            editMode
            onFocus={(id) => dispatch({ type: "select", id })}
            onEdit={(id, patch) => stageEdit((d) => { const blk = d.rows.flatMap((r) => r.blocks).find((b) => b.id === id); if (blk) Object.assign(blk.props as Record<string, unknown>, patch); })}
          >
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
              onHandleClick={(id) => { dispatch({ type: "select", id }); setMenuId(id); }}
              menuId={menuId}
            />
            {loaded && state.present.rows.length === 0 && !editing && (
              <div class="empty-hint">Start typing — or press <kbd>/</kbd> for blocks</div>
            )}
            <div class="drop-indicator" ref={indicatorRef} />
            {editBox && editing && editingBlock?.type === "table" && !INPLACE_EDIT.has(editingBlock.type) && (
              <TableEditor
                box={editBox}
                scale={scale}
                block={editingBlock}
                setContent={(v) => stageEdit((d) => { const blk = d.rows.flatMap((r) => r.blocks).find((b) => b.id === editing.id); if (blk && blk.type === "table") blk.props.content = v; })}
                setHeader={(h) => stageEdit((d) => { const blk = d.rows.flatMap((r) => r.blocks).find((b) => b.id === editing.id); if (blk && blk.type === "table") blk.props.header = h; })}
                onClose={() => setEditing(null)}
              />
            )}
            {editBox && editing && editingBlock && LIST_EDIT.has(editingBlock.type) && !INPLACE_EDIT.has(editingBlock.type) && (
              <ListEditor
                box={editBox}
                scale={scale}
                block={editingBlock}
                prop={editing.prop}
                setItems={(v) => stageEdit((d) => { const blk = d.rows.flatMap((r) => r.blocks).find((b) => b.id === editing.id); if (blk) (blk.props as Record<string, unknown>)[editing.prop] = v; })}
                onClose={() => setEditing(null)}
              />
            )}
            {editBox && editing && editingBlock?.type !== "table" && !(editingBlock && LIST_EDIT.has(editingBlock.type)) && !(editingBlock && INPLACE_EDIT.has(editingBlock.type)) && (
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
            {menuId === primary && primaryBox && primaryBlock && !presenting && slashRow === null && (
              <>
                <div class="popover-backdrop" onPointerDown={() => setMenuId(null)} />
                <BlockMenu
                  box={primaryBox}
                  scale={scale}
                  stageW={stageW}
                  canEdit={TEXT_PROP[primaryBlock.type] !== undefined && !INPLACE_EDIT.has(primaryBlock.type)}
                  canBind={BINDABLE.has(primaryBlock.type)}
                  bound={!!primaryBlock.source}
                  locked={!!primaryBlock.locked}
                  editItems={primaryBlock.type === "tasks" ? "tasks" : primaryBlock.type === "queue" ? "queue" : null}
                  onEdit={() => { if (primary) startEditing(primary); setMenuId(null); }}
                  onConvert={() => { setOptionsOpen(false); setDataOpen(false); setMenuId(null); setConvertId(primary); }}
                  onData={() => { setConvertId(null); setOptionsOpen(false); setMenuId(null); setDataOpen(true); }}
                  onOptions={() => { setConvertId(null); setDataOpen(false); setMenuId(null); setOptionsOpen(true); }}
                  onToggleLock={() => { setMenuId(null); if (primary) stageEdit((d) => { const blk = d.rows.flatMap((r) => r.blocks).find((bb) => bb.id === primary); if (blk) blk.locked = blk.locked ? undefined : true; }); }}
                  onDelete={() => { setMenuId(null); removeSelected(); }}
                />
              </>
            )}
            {optionsOpen && optionsPos && primaryBlock && (
              <>
                <div class="popover-backdrop" onPointerDown={() => setOptionsOpen(false)} />
                <div class="block-popover" style={{ left: `${optionsPos.x}px`, top: `${optionsPos.y}px` }} onPointerDown={(e) => (e as unknown as Event).stopPropagation()}>
                  <BlockFields block={primaryBlock} stageEdit={stageEdit} onMakeLive={() => { setOptionsOpen(false); setDataOpen(true); }} />
                </div>
              </>
            )}
            {dataOpen && optionsPos && primaryBlock && (
              <>
                <div class="popover-backdrop" onPointerDown={() => setDataOpen(false)} />
                <div class="block-popover" style={{ left: `${optionsPos.x}px`, top: `${optionsPos.y}px` }} onPointerDown={(e) => (e as unknown as Event).stopPropagation()}>
                  <DataPanel block={primaryBlock} setSource={(src) => setSource(primaryBlock.id, src)} onClose={() => setDataOpen(false)} />
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
        <aside class={`studio-side pinned${sideShown ? " open" : ""}`}>
          <div class="sidebar-header">
            <h3>Blocks</h3>
          </div>
          <Palette
            stageRef={stageRef}
            geometry={geometry}
            scale={scale}
            docRef={docRef}
            dragLayer={dragLayer}
            onDrop={(type, target) => performDrop({ kind: "new", type }, target)}
            onClickInsert={(type) => insertBlock(type, docRef.current.rows.length, !!TEXT_PROP[type])}
          />
          <button class="settings-toggle" onClick={() => setObjectsOpen((v) => !v)}>
            <Icon.list /> <span>Objects</span>
            <Icon.chevron class={`chevron${objectsOpen ? " open" : ""}`} />
          </button>
          {objectsOpen && <ObjectsPanel doc={state.present} stageEdit={stageEdit} selectedIds={state.selectedIds} onSelect={(id) => dispatch({ type: "select", id })} />}
          <button class="settings-toggle" onClick={() => setBoardSettingsOpen((v) => !v)}>
            <Icon.settings /> <span>Board settings</span>
            <Icon.chevron class={`chevron${boardSettingsOpen ? " open" : ""}`} />
          </button>
          {boardSettingsOpen && <BoardSettings doc={state.present} commitDoc={commitDoc} />}
        </aside>
      </div>
      <div class="drag-chip drag-card" ref={ghostRef} />
      {presenting && <Present doc={state.present} data={data} W={W} H={H} onClose={() => setPresenting(false)} />}
      {showHelp && <Shortcuts onClose={() => setShowHelp(false)} />}
    </div>
  );
}

// A scannable QR for the share URL, with a one-click PNG export (rasterized from
// the module matrix — no SVG round-trip). Renders nothing if the URL is too long
// for v10-M (encodeQR throws).
function ShareQR({ url }: { url: string }) {
  let svg: string;
  try { svg = qrSvg(url, { size: 168 }); } catch { return null; }
  const savePng = () => {
    try {
      const matrix = encodeQR(url);
      const n = matrix.length, quiet = 4, scale = 8, dim = (n + quiet * 2) * scale;
      const cv = document.createElement("canvas");
      cv.width = cv.height = dim;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, dim, dim);
      ctx.fillStyle = "#000";
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (matrix[r]![c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      cv.toBlob((b) => {
        if (!b) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = "glanceos-share-qr.png";
        a.click();
        URL.revokeObjectURL(a.href);
      });
    } catch { /* too long → no-op */ }
  };
  return (
    <div class="share-qr">
      <div class="share-qr-img" dangerouslySetInnerHTML={{ __html: svg }} />
      <button class="ghost share-qr-save" onClick={savePng}>Save PNG</button>
    </div>
  );
}
