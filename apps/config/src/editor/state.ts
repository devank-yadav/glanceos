import type { LayoutT } from "@glanceos/schema";

// Editor document state with history. The gesture mechanism guarantees one
// undo step per drag/resize — and, reused with a debounce, one per typing
// burst in the properties panel.

const HISTORY_CAP = 50;

export interface EditorState {
  past: LayoutT[];
  present: LayoutT;
  future: LayoutT[];
  gestureBase: LayoutT | null;
  // multi-select; the primary (most-recent) selection is the last id
  selectedIds: string[];
}

export type EditorAction =
  | { type: "replace"; doc: LayoutT } // initial load — no history
  | { type: "select"; id: string | null } // single (or clear)
  | { type: "selectToggle"; id: string } // shift-click adds/removes
  | { type: "selectMany"; ids: string[] }
  | { type: "commit"; doc: LayoutT } // one undo step (insert, delete, settings)
  | { type: "gestureStart" }
  | { type: "gestureUpdate"; doc: LayoutT }
  | { type: "gestureEnd" }
  | { type: "gestureCancel" }
  | { type: "undo" }
  | { type: "redo" };

export function initialEditor(doc: LayoutT): EditorState {
  return { past: [], present: doc, future: [], gestureBase: null, selectedIds: [] };
}

/** The block whose properties the panel edits — the most recent selection. */
export const primaryId = (s: EditorState): string | null => s.selectedIds[s.selectedIds.length - 1] ?? null;

const push = (past: LayoutT[], doc: LayoutT): LayoutT[] => [...past, doc].slice(-HISTORY_CAP);

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "replace":
      return initialEditor(action.doc);
    case "select":
      return { ...state, selectedIds: action.id ? [action.id] : [] };
    case "selectToggle":
      return {
        ...state,
        selectedIds: state.selectedIds.includes(action.id)
          ? state.selectedIds.filter((id) => id !== action.id)
          : [...state.selectedIds, action.id],
      };
    case "selectMany":
      return { ...state, selectedIds: action.ids };
    case "commit":
      return {
        ...state,
        past: push(state.past, state.present),
        present: action.doc,
        future: [],
      };
    case "gestureStart":
      // A gesture inside a gesture keeps the ORIGINAL base — still one undo step.
      return state.gestureBase ? state : { ...state, gestureBase: state.present };
    case "gestureUpdate":
      return { ...state, present: action.doc };
    case "gestureEnd": {
      if (!state.gestureBase) return state;
      const changed = JSON.stringify(state.gestureBase) !== JSON.stringify(state.present);
      return {
        ...state,
        past: changed ? push(state.past, state.gestureBase) : state.past,
        future: changed ? [] : state.future,
        gestureBase: null,
      };
    }
    case "gestureCancel":
      return state.gestureBase
        ? { ...state, present: state.gestureBase, gestureBase: null }
        : state;
    case "undo": {
      if (state.gestureBase || state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1]!;
      return {
        ...state,
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      if (state.gestureBase || state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        ...state,
        past: push(state.past, state.present),
        present: next!,
        future: rest,
      };
    }
  }
}
