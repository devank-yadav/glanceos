// The keyboard-shortcuts cheat sheet (press ?).
const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: "Blocks",
    items: [
      ["/", "Insert a block"],
      ["Double-click", "Type text anywhere"],
      ["Enter", "Edit the selected block"],
      ["⌘D", "Duplicate selection"],
      ["⌫", "Delete selection"],
    ],
  },
  {
    title: "Clipboard",
    items: [
      ["⌘C", "Copy blocks"],
      ["⌘X", "Cut blocks"],
      ["⌘V", "Paste (any board)"],
      ["⌘⇧C / ⌘⇧V", "Copy / paste style"],
      ["Shift-click", "Add to selection"],
      ["Drag canvas", "Marquee-select"],
    ],
  },
  {
    title: "Arrange",
    items: [
      ["Arrows", "Move block in its line / across lines"],
      ["⌘⇧↑ / ⌘⇧↓", "Move the whole line"],
      ["Drag ⠿", "Move · edges make columns"],
      ["Drag a seam", "Resize width / height"],
    ],
  },
  {
    title: "View",
    items: [
      ["⌘Z / ⇧⌘Z", "Undo / redo"],
      ["P", "Present full screen"],
      ["?", "This help"],
      ["Esc", "Deselect / close"],
    ],
  },
];

export function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet shortcuts" onClick={(e) => e.stopPropagation()}>
        <div class="row spread">
          <h3>Keyboard shortcuts</h3>
          <button class="ghost" onClick={onClose}>✕</button>
        </div>
        <div class="sc-cols">
          {GROUPS.map((g) => (
            <div key={g.title} class="sc-group">
              <h4>{g.title}</h4>
              {g.items.map(([k, d]) => (
                <div key={d} class="sc-row">
                  <kbd>{k}</kbd>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
