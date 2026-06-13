import type { VNode } from "preact";

// A small inline stat/metadata pill (reuses .chip). Optional leading icon.
export function StatChip({ icon, children, title }: { icon?: VNode; children: preact.ComponentChildren; title?: string }) {
  return (
    <span class="chip stat-chip" title={title}>
      {icon}
      <span>{children}</span>
    </span>
  );
}
