// Sub-navigation for the "Screens" area — the screens themselves and the groups
// that show the same thing. (Board rotation now lives inside a board as pages, so
// the old "Rotations"/playlists tab is gone.) Rendered at the top of each page.
const TABS: { name: string; label: string; href: string }[] = [
  { name: "screens", label: "Screens", href: "#/screens" },
  { name: "groups", label: "Groups", href: "#/groups" },
];

export function ScreensTabs({ active }: { active: "screens" | "groups" }) {
  return (
    <div class="tabs" role="tablist">
      {TABS.map((t) => (
        <a key={t.name} class={`tab ${active === t.name ? "on" : ""}`} role="tab" aria-selected={active === t.name} href={t.href}>{t.label}</a>
      ))}
    </div>
  );
}
