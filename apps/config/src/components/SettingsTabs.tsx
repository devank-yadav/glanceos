// Sub-navigation for the "Settings" area: your account + the connections to
// external apps. (Connecting an account is also contextual in the Studio Data tab;
// this is the management list.)
const TABS: { name: string; label: string; href: string }[] = [
  { name: "account", label: "Account", href: "#/account" },
  { name: "connections", label: "Connections", href: "#/integrations" },
];

export function SettingsTabs({ active }: { active: "account" | "connections" }) {
  return (
    <div class="tabs" role="tablist">
      {TABS.map((t) => (
        <a key={t.name} class={`tab ${active === t.name ? "on" : ""}`} role="tab" aria-selected={active === t.name} href={t.href}>{t.label}</a>
      ))}
    </div>
  );
}
