import type { VNode } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

// A small dropdown menu for secondary/overflow actions (card kebabs, the sidebar
// account menu). Click-outside + Escape close; reuses the studio .block-menu look.

export interface MenuItem {
  label: string;
  icon?: VNode;
  danger?: boolean;
  onClick: () => void;
}

export function Menu({ trigger, items, align = "right", triggerClass = "icon-btn", triggerLabel = "More" }: { trigger: VNode; items: MenuItem[]; align?: "left" | "right"; triggerClass?: string; triggerLabel?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div class="menu-wrap" ref={ref}>
      <button class={`${triggerClass} menu-trigger`} aria-haspopup="menu" aria-expanded={open} aria-label={triggerLabel} onClick={() => setOpen((v) => !v)}>
        {trigger}
      </button>
      {open && (
        <ul class={`block-menu menu-pop menu-${align}`} role="menu">
          {items.map((it) => (
            <li key={it.label} role="none">
              <button class={`bm-item${it.danger ? " bm-danger" : ""}`} role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}>
                {it.icon}{it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
