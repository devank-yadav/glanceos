import { describe, expect, it } from "vitest";
import type { LayoutT } from "@glanceos/schema";
import { editorReducer, initialEditor, type EditorState } from "./state";

const doc = (name: string): LayoutT => ({
  schemaVersion: 3,
  name,
  theme: { mode: "light", fontScale: "m" },
  gap: 1,
  align: "top",
  rows: [],
});

const run = (state: EditorState, ...actions: Parameters<typeof editorReducer>[1][]): EditorState =>
  actions.reduce(editorReducer, state);

describe("editor history", () => {
  it("a whole gesture is exactly one undo step", () => {
    let s = initialEditor(doc("base"));
    s = run(
      s,
      { type: "gestureStart" },
      { type: "gestureUpdate", doc: doc("drag-1") },
      { type: "gestureUpdate", doc: doc("drag-2") },
      { type: "gestureUpdate", doc: doc("drag-3") },
      { type: "gestureEnd" },
    );
    expect(s.present.name).toBe("drag-3");
    expect(s.past).toHaveLength(1);
    s = editorReducer(s, { type: "undo" });
    expect(s.present.name).toBe("base");
  });

  it("an unchanged gesture leaves history alone", () => {
    let s = initialEditor(doc("base"));
    s = run(s, { type: "gestureStart" }, { type: "gestureEnd" });
    expect(s.past).toHaveLength(0);
  });

  it("cancel restores the pre-gesture document", () => {
    let s = initialEditor(doc("base"));
    s = run(s, { type: "gestureStart" }, { type: "gestureUpdate", doc: doc("mid") }, { type: "gestureCancel" });
    expect(s.present.name).toBe("base");
    expect(s.past).toHaveLength(0);
  });

  it("undo/redo round-trips and a new commit clears redo", () => {
    let s = initialEditor(doc("one"));
    s = run(s, { type: "commit", doc: doc("two") }, { type: "commit", doc: doc("three") });
    s = run(s, { type: "undo" }, { type: "undo" });
    expect(s.present.name).toBe("one");
    s = editorReducer(s, { type: "redo" });
    expect(s.present.name).toBe("two");
    s = editorReducer(s, { type: "commit", doc: doc("fork") });
    expect(s.future).toHaveLength(0);
    expect(editorReducer(s, { type: "redo" }).present.name).toBe("fork"); // no-op
  });

  it("caps history at 50, evicting the oldest", () => {
    let s = initialEditor(doc("v0"));
    for (let i = 1; i <= 60; i++) s = editorReducer(s, { type: "commit", doc: doc(`v${i}`) });
    expect(s.past).toHaveLength(50);
    expect(s.past[0]!.name).toBe("v10");
  });

  it("ignores undo mid-gesture", () => {
    let s = initialEditor(doc("base"));
    s = run(s, { type: "commit", doc: doc("two") }, { type: "gestureStart" });
    expect(editorReducer(s, { type: "undo" }).present.name).toBe("two");
  });

  it("supports single and multi selection", () => {
    let s = initialEditor(doc("base"));
    s = editorReducer(s, { type: "select", id: "a" });
    expect(s.selectedIds).toEqual(["a"]);
    s = editorReducer(s, { type: "selectToggle", id: "b" });
    expect(s.selectedIds).toEqual(["a", "b"]); // primary = last = b
    s = editorReducer(s, { type: "selectToggle", id: "a" });
    expect(s.selectedIds).toEqual(["b"]);
    s = editorReducer(s, { type: "select", id: null });
    expect(s.selectedIds).toEqual([]);
  });
});
