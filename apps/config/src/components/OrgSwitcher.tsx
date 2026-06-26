import { api, type OrgSummary } from "../api";
import { Icon } from "../editor/icons";
import { Menu } from "./Menu";

// Workspace switcher in the sidebar head. Lists the user's orgs (personal first),
// switches the active workspace server-side, and links to the Team page. A solo user
// just sees "Personal" — no team chrome until they create or join one.

export function OrgSwitcher({ orgs, activeOrgId, onNavigate }: { orgs: OrgSummary[]; activeOrgId: string | null; onNavigate?: () => void }) {
  const active = orgs.find((o) => o.id === activeOrgId) ?? orgs[0];
  const label = active ? (active.personal ? "Personal" : active.name) : "Workspace";

  const switchTo = async (id: string) => {
    if (id === activeOrgId) return;
    try {
      await api.post("/api/orgs/switch", { orgId: id });
      location.reload(); // reload so every page re-fetches under the new org
    } catch { /* stay put on failure */ }
  };

  const items = [
    ...orgs.map((o) => ({
      label: `${o.id === active?.id ? "✓  " : "    "}${o.personal ? "Personal" : o.name}`,
      onClick: () => switchTo(o.id),
    })),
    { label: "Team & members", icon: <Icon.settings />, onClick: () => { location.hash = "#/members"; onNavigate?.(); } },
  ];

  return (
    <Menu
      align="left"
      triggerClass="org-switcher"
      triggerLabel="Switch workspace"
      trigger={<><span class="sidebar-label org-switcher-name">{label}</span><Icon.chevron /></>}
      items={items}
    />
  );
}
