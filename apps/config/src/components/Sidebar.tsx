import { Icon } from "../editor/icons";
import type { Theme } from "../hooks/useTheme";
import { IconButton } from "./IconButton";
import { Menu } from "./Menu";
import { NotificationsBell } from "./NotificationsBell";

// Notion-style left navigation: brand, search (⌘K), the page links, and an
// account menu (theme + log out) pinned to the bottom. Collapses to icons.

const NAV = [
  { name: "screens", href: "#/", label: "Screens", icon: <Icon.grid /> },
  { name: "fleet", href: "#/fleet", label: "Fleet", icon: <Icon.monitor /> },
  { name: "setups", href: "#/setups", label: "Setups", icon: <Icon.pencil /> },
  { name: "playlists", href: "#/playlists", label: "Playlists", icon: <Icon.play /> },
  { name: "hub", href: "#/hub", label: "Hub", icon: <Icon.convert /> },
  { name: "integrations", href: "#/integrations", label: "Integrations", icon: <Icon.link /> },
];

const themeLabel = (t: Theme): string => (t === "dark" ? "Theme · Dark" : t === "light" ? "Theme · Light" : "Theme · System");

export function Sidebar({
  page,
  collapsed,
  onToggle,
  userName,
  onLogout,
  theme,
  onCycleTheme,
  onOpenPalette,
  onNavigate,
}: {
  page: string;
  collapsed: boolean;
  onToggle: () => void;
  userName: string;
  onLogout: () => void;
  theme: Theme;
  onCycleTheme: () => void;
  onOpenPalette: () => void;
  onNavigate?: () => void;
}) {
  return (
    <aside class="sidebar" aria-label="Main navigation">
      <div class="sidebar-head">
        <a class="brand" href="#/">glanceos</a>
        <IconButton class="sidebar-collapse" icon={<Icon.panelToggle />} label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={onToggle} />
      </div>

      <button class="sidebar-search" onClick={onOpenPalette} title="Search & commands (⌘K)">
        <Icon.search />
        <span class="sidebar-label">Search…</span>
        <kbd class="sidebar-kbd">⌘K</kbd>
      </button>

      <nav class="sidebar-nav">
        {NAV.map((n) => (
          <a key={n.name} class="sidebar-link" href={n.href} aria-current={page === n.name ? "page" : undefined} onClick={onNavigate} title={n.label}>
            {n.icon}
            <span class="sidebar-label">{n.label}</span>
          </a>
        ))}
      </nav>

      <div class="sidebar-foot">
        <NotificationsBell />
        <Menu
          align="left"
          triggerClass="sidebar-account"
          triggerLabel="Account menu"
          trigger={<><span class="avatar" aria-hidden="true">{(userName || "?").slice(0, 1).toUpperCase()}</span><span class="sidebar-label">{userName}</span></>}
          items={[
            { label: "Account", icon: <Icon.settings />, onClick: () => { location.hash = "#/account"; onNavigate?.(); } },
            { label: themeLabel(theme), icon: theme === "dark" ? <Icon.moon /> : <Icon.sun />, onClick: onCycleTheme },
            { label: "Log out", icon: <Icon.x />, danger: true, onClick: onLogout },
          ]}
        />
      </div>
    </aside>
  );
}
