import { Icon } from "../editor/icons";
import type { Theme } from "../hooks/useTheme";
import { t } from "../i18n";
import { IconButton } from "./IconButton";
import { Menu } from "./Menu";
import { NotificationsBell } from "./NotificationsBell";

// Notion-style left navigation: brand, search (⌘K), the page links, and an
// account menu (theme + log out) pinned to the bottom. Collapses to icons.

// A calm three. Everything else (templates, groups, rotations, connections,
// automations, sharing, remote) folds into these or into the Studio.
const NAV = [
  { name: "boards", href: "#/boards", label: "Boards", icon: <Icon.grid /> },
  { name: "screens", href: "#/screens", label: "Screens", icon: <Icon.monitor /> },
  { name: "account", href: "#/account", label: "Settings", icon: <Icon.settings /> },
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
        <span class="sidebar-label">{t("nav.search")}</span>
        <kbd class="sidebar-kbd">⌘K</kbd>
      </button>

      <nav class="sidebar-nav">
        {NAV.map((n) => {
          const label = t(`nav.${n.name}`);
          return (
            <a key={n.name} class="sidebar-link" href={n.href} aria-current={page === n.name ? "page" : undefined} onClick={onNavigate} title={label}>
              {n.icon}
              <span class="sidebar-label">{label}</span>
            </a>
          );
        })}
      </nav>

      <div class="sidebar-foot">
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
        <NotificationsBell />
      </div>
    </aside>
  );
}
