import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useRef } from "preact/hooks";
import { Icon } from "../editor/icons";

// Accessible modal: role=dialog, Escape closes, focus trapped inside, focus
// restored to the opener on close. Reuses the glassy .sheet look.
//
// Rendered through a portal to <body>: a position:fixed backdrop is otherwise
// contained by any transformed/animated ancestor (e.g. .card:hover's transform
// or the page-enter animation), which threw the sheet off-screen / "in two
// places". Portaling pins it to the viewport no matter where <Modal> is mounted.
export function Modal({
  open,
  onClose,
  title,
  children,
  width,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ComponentChildren;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    const node = ref.current;
    const focusables = () =>
      Array.from(node?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? [])
        .filter((el) => !el.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (f.length === 0) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div class="sheet-backdrop" onPointerDown={onClose}>
      <div
        ref={ref}
        class="sheet"
        style={width ? { width: `${width}px` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onPointerDown={(e) => (e as unknown as Event).stopPropagation()}
      >
        <div class="sheet-head">
          <h3 id="modal-title">{title}</h3>
          <button class="icon-btn" aria-label="Close" onClick={onClose}><Icon.x /></button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
