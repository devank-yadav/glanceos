import type { JSX, VNode } from "preact";

// An icon-only button that REQUIRES an accessible label (TS-enforced), so no
// icon button can ship without aria-label.
export function IconButton({
  icon,
  label,
  class: cls = "",
  ...rest
}: { icon: VNode; label: string; class?: string } & Omit<JSX.HTMLAttributes<HTMLButtonElement>, "class" | "icon" | "label">) {
  return (
    <button type="button" class={`icon-btn ${cls}`} aria-label={label} title={label} {...rest}>
      {icon}
    </button>
  );
}
