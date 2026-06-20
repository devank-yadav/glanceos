import type { ComponentType } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { api, type AuthStatus } from "./api";
import { AuthPage } from "./auth";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { ShellCtx } from "./components/PageHeader";
import { Sidebar } from "./components/Sidebar";
import { Icon } from "./editor/icons";
import { useTheme } from "./hooks/useTheme";
import { AccountPage } from "./pages/account";
import { FleetPage } from "./pages/fleet";
import { GroupsPage } from "./pages/groups";
import { HubPage } from "./pages/hub";
import { Onboarding } from "./pages/onboarding";
import { DISMISS_KEY, needsOnboarding } from "./onboarding";
import { InletsPage } from "./pages/inlets";
import { IntegrationsPage } from "./pages/integrations";
import { Landing } from "./pages/landing";
import { PlaylistsPage } from "./pages/playlists";
import { ScreensPage } from "./pages/screens";
import { SetupsPage } from "./pages/setups";
import { SharedPage } from "./pages/shared";
import { navigate, useRoute } from "./router";

// The Studio (and zod with it) lives in its own chunk: the shell loads tiny,
// and we warm the chunk during idle time so opening a board feels instant.
let studioModule: Promise<typeof import("./editor/studio")> | null = null;
const loadStudio = () => (studioModule ??= import("./editor/studio"));

function StudioRoute({ layoutId }: { layoutId: number }) {
  const [Studio, setStudio] = useState<ComponentType<{ layoutId: number }> | null>(null);
  useEffect(() => {
    let mounted = true;
    loadStudio().then((m) => { if (mounted) setStudio(() => m.Studio); });
    return () => { mounted = false; };
  }, []);
  return Studio ? <Studio layoutId={layoutId} /> : <Splash />;
}

function Splash() {
  return (
    <main class="splash">
      <span class="splash-mark">glanceos</span>
    </main>
  );
}

const SIDEBAR_KEY = "glanceos.sidebar";

export function App() {
  const route = useRoute();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [theme, , cycleTheme] = useTheme();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === "1"; } catch { return false; }
  });
  const [drawer, setDrawer] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [onboard, setOnboard] = useState(false);

  const refreshAuth = async () => {
    try { setStatus(await api.get<AuthStatus>("/api/auth/status")); }
    catch { setStatus({ authed: false, user: null, registrationOpen: true }); }
  };

  useEffect(() => { refreshAuth(); }, []);

  useEffect(() => {
    if (!status?.authed) return;
    const t = window.setTimeout(loadStudio, 1200);
    return () => window.clearTimeout(t);
  }, [status?.authed]);

  // First-run: show the wizard on a fresh, undismissed account (no boards + no screens).
  useEffect(() => {
    if (!status?.authed) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* ignore */ }
    if (dismissed) return;
    Promise.all([api.get<unknown[]>("/api/devices"), api.get<unknown[]>("/api/layouts")])
      .then(([d, l]) => setOnboard(needsOnboarding({ deviceCount: d.length, layoutCount: l.length, dismissed: false })))
      .catch(() => {});
  }, [status?.authed]);

  // ⌘K opens the palette; close the mobile drawer whenever the route changes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { setDrawer(false); }, [route.name]);

  const toggleCollapse = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem(SIDEBAR_KEY, n ? "1" : "0"); } catch { /* ignore */ } return n; });

  const logout = () => api.post("/api/auth/logout").then(refreshAuth);

  const commands = useMemo<Command[]>(() => [
    { id: "nav-screens", label: "Go to Screens", hint: "Page", icon: <Icon.grid />, run: () => navigate("/") },
    { id: "nav-fleet", label: "Go to Fleet", hint: "Page", icon: <Icon.monitor />, run: () => navigate("/fleet") },
    { id: "nav-groups", label: "Go to Groups", hint: "Page", icon: <Icon.layers />, run: () => navigate("/groups") },
    { id: "nav-setups", label: "Go to Setups", hint: "Page", icon: <Icon.pencil />, run: () => navigate("/setups") },
    { id: "nav-playlists", label: "Go to Playlists", hint: "Page", icon: <Icon.play />, run: () => navigate("/playlists") },
    { id: "nav-hub", label: "Go to Hub", hint: "Page", icon: <Icon.convert />, run: () => navigate("/hub") },
    { id: "nav-integrations", label: "Go to Integrations", hint: "Page", icon: <Icon.link />, run: () => navigate("/integrations") },
    { id: "nav-account", label: "Go to Account", hint: "Page", icon: <Icon.settings />, run: () => navigate("/account") },
    { id: "new-setup", label: "New setup", hint: "Action", icon: <Icon.plus />, run: async () => {
        try { const r = await api.post<{ id: number }>("/api/layouts", { name: "Untitled setup" }); navigate(`/edit/${r.id}`); } catch { navigate("/setups"); }
      } },
    { id: "help-onboard", label: "Show the setup guide", hint: "Help", icon: <Icon.help />, run: () => { try { localStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ } setOnboard(true); } },
    { id: "theme", label: "Toggle theme", hint: "Appearance", icon: theme === "dark" ? <Icon.moon /> : <Icon.sun />, run: cycleTheme },
    { id: "logout", label: "Log out", hint: "Account", icon: <Icon.x />, run: logout },
  ], [theme]);

  if (!status) return <Splash />;

  if (!status.authed) {
    if (route.name === "login" || route.name === "register") {
      return <AuthPage mode={route.name} registrationOpen={status.registrationOpen} onDone={refreshAuth} />;
    }
    return <Landing registrationOpen={status.registrationOpen} />;
  }

  const page = route.name === "login" || route.name === "register" ? ({ name: "screens" } as const) : route;

  // The studio is a full-screen surface with its own chrome.
  if (page.name === "edit") return <StudioRoute layoutId={page.layoutId} />;

  // First-run wizard takes over until a board/screen exists or it's dismissed.
  if (onboard) return <Onboarding onDone={() => setOnboard(false)} />;

  return (
    <ShellCtx.Provider value={{ openDrawer: () => setDrawer(true) }}>
      <div class={`app-shell${collapsed ? " collapsed" : ""}${drawer ? " drawer-open" : ""}`}>
        <a class="skip-link" href="#main">Skip to content</a>
        <Sidebar
          page={page.name}
          collapsed={collapsed}
          onToggle={toggleCollapse}
          userName={status.user!.name}
          onLogout={logout}
          theme={theme}
          onCycleTheme={cycleTheme}
          onOpenPalette={() => setPaletteOpen(true)}
          onNavigate={() => setDrawer(false)}
        />
        {drawer && <div class="sidebar-scrim" onClick={() => setDrawer(false)} />}
        <main id="main" class="shell-main page-enter">
          {page.name === "screens" && <ScreensPage />}
          {page.name === "fleet" && <FleetPage />}
          {page.name === "groups" && <GroupsPage />}
          {page.name === "setups" && <SetupsPage />}
          {page.name === "playlists" && <PlaylistsPage />}
          {page.name === "hub" && <HubPage />}
          {page.name === "integrations" && <IntegrationsPage />}
          {page.name === "inlets" && <InletsPage />}
          {page.name === "shared" && <SharedPage />}
          {page.name === "account" && <AccountPage />}
        </main>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      </div>
    </ShellCtx.Provider>
  );
}
