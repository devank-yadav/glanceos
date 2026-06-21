import type { JSX, VNode } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";

// A small dropdown menu for secondary/overflow actions (card kebabs, the sidebar
// account menu). The panel is PORTALED to <body> with fixed coords measured from
// the trigger — so a card/grid `overflow` can't clip it and the cards' hover
// transform can't break its compositing (it used to go transparent/glitchy). It
// flips above the trigger when there isn't room below. Click-outside + Escape close.

export interface MenuItem {
  label: string;
  icon?: VNode;
  danger?: boolean;
  onClick: () => void;
}

export function Menu({ trigger, items, align = "right", triggerClass = "icon-btn", triggerLabel = "More" }: { trigger: VNode; items: MenuItem[]; align?: "left" | "right"; triggerClass?: string; triggerLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<JSX.CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = wrapRef.current?.querySelector(".menu-trigger")?.getBoundingClientRect();
    if (r) {
      const estH = Math.min(items.length * 38 + 12, 360);
      const below = window.innerHeight - r.bottom;
      const p: JSX.CSSProperties = {};
      // open below if there's room (or more room below than above), else above
      if (below >= estH || below >= r.top) p.top = `${Math.round(r.bottom + 4)}px`;
      else p.bottom = `${Math.round(window.innerHeight - r.top + 4)}px`;
      // align the panel's edge to the trigger, clamped on-screen
      if (align === "right") p.right = `${Math.round(Math.max(8, window.innerWidth - r.right))}px`;
      else p.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - 200)))}px`;
      setPos(p);
    }
    setOpen(true);
  };

  return (
    <div class="menu-wrap" ref={wrapRef}>
      <button class={`${triggerClass} menu-trigger`} aria-haspopup="menu" aria-expanded={open} aria-label={triggerLabel} onClick={toggle}>
        {trigger}
      </button>
      {open && createPortal(
        <ul ref={popRef} class={`block-menu menu-pop menu-${align}`} role="menu" style={pos}>
          {items.map((it) => (
            <li key={it.label} role="none">
              <button class={`bm-item${it.danger ? " bm-danger" : ""}`} role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}>
                {it.icon}{it.label}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
