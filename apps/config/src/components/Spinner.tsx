export function Spinner({ class: cls = "" }: { class?: string }) {
  return <span class={`spinner ${cls}`} role="status" aria-label="Loading" />;
}
