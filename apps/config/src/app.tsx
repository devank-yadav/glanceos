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
import { DISMISS_KEY } from "./onboarding";
import { AutomationsPage } from "./pages/automations";
import { InletsPage } from "./pages/inlets";
import { IntegrationsPage } from "./pages/integrations";
import { RemotePage } from "./pages/remote";
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
const BOOTSTRAP_KEY = "glanceos.bootstrapped"; // per-session guard for the new-account → fresh-board jump

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

  // First-run: drop a brand-new account straight into a fresh board in the Studio —
  // "land in your work", not on an empty management page. (The step-by-step guide is
  // still reachable from the ⌘K palette.) Guarded so it fires at most once per session.
  useEffect(() => {
    if (!status?.authed) return;
    let booted = false;
    try { booted = sessionStorage.getItem(BOOTSTRAP_KEY) === "1"; } catch { /* ignore */ }
    if (booted) return;
    api.get<unknown[]>("/api/layouts")
      .then((l) => {
        try { sessionStorage.setItem(BOOTSTRAP_KEY, "1"); } catch { /* ignore */ }
        if (l.length === 0) return api.post<{ id: number }>("/api/layouts", { name: "My first board" }).then((r) => navigate(`/edit/${r.id}`));
      })
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
    // primary destinations (the calm 3) + the most common action
    { id: "new-board", label: "New board", hint: "Action", icon: <Icon.plus />, run: async () => {
        try { const r = await api.post<{ id: number }>("/api/layouts", { name: "Untitled board" }); navigate(`/edit/${r.id}`); } catch { navigate("/boards"); }
      } },
    { id: "nav-boards", label: "Go to Boards", hint: "Page", icon: <Icon.grid />, run: () => navigate("/boards") },
    { id: "nav-screens", label: "Go to Screens", hint: "Page", icon: <Icon.monitor />, run: () => navigate("/screens") },
    { id: "nav-settings", label: "Go to Settings", hint: "Page", icon: <Icon.settings />, run: () => navigate("/account") },
    // transitional deep-links (these fold into Screens/Settings/Studio in later phases)
    { id: "nav-templates", label: "Browse templates", hint: "Page", icon: <Icon.convert />, run: () => navigate("/hub") },
    { id: "nav-shared", label: "Shared with me", hint: "Page", icon: <Icon.copy />, run: () => navigate("/shared") },
    { id: "nav-groups", label: "Screen groups", hint: "Page", icon: <Icon.layers />, run: () => navigate("/groups") },
    { id: "nav-playlists", label: "Rotations", hint: "Page", icon: <Icon.play />, run: () => navigate("/playlists") },
    { id: "nav-automations", label: "Automations", hint: "Page", icon: <Icon.target />, run: () => navigate("/automations") },
    { id: "nav-integrations", label: "Connections", hint: "Page", icon: <Icon.link />, run: () => navigate("/integrations") },
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
          {page.name === "boards" && <SetupsPage />}
          {page.name === "screens" && <ScreensPage />}
          {page.name === "fleet" && <FleetPage />}
          {page.name === "groups" && <GroupsPage />}
          {page.name === "playlists" && <PlaylistsPage />}
          {page.name === "hub" && <HubPage />}
          {page.name === "integrations" && <IntegrationsPage />}
          {page.name === "inlets" && <InletsPage />}
          {page.name === "automations" && <AutomationsPage />}
          {page.name === "shared" && <SharedPage />}
          {page.name === "remote" && <RemotePage />}
          {page.name === "account" && <AccountPage />}
        </main>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      </div>
    </ShellCtx.Provider>
  );
}
