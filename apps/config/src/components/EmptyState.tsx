import type { VNode } from "preact";

// One calm empty state used across pages — icon, title, body, optional CTA.
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: VNode;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div class="empty-state">
      {icon && <span class="empty-icon">{icon}</span>}
      <h2 class="empty-title">{title}</h2>
      {body && <p class="muted">{body}</p>}
      {action && <button class="primary" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
