// Sub-navigation for the "Screens" area — the three things you do with physical
// displays: the screens themselves, the groups that show the same thing, and the
// rotations (was "playlists") that cycle boards. Rendered at the top of each page.
const TABS: { name: string; label: string; href: string }[] = [
  { name: "screens", label: "Screens", href: "#/screens" },
  { name: "groups", label: "Groups", href: "#/groups" },
  { name: "playlists", label: "Rotations", href: "#/playlists" },
];

export function ScreensTabs({ active }: { active: "screens" | "groups" | "playlists" }) {
  return (
    <div class="tabs" role="tablist">
      {TABS.map((t) => (
        <a key={t.name} class={`tab ${active === t.name ? "on" : ""}`} role="tab" aria-selected={active === t.name} href={t.href}>{t.label}</a>
      ))}
    </div>
  );
}
