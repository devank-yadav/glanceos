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
import { GroupsPage } from "./pages/groups";
import { HubPage } from "./pages/hub";
import { Onboarding } from "./pages/onboarding";
import { DISMISS_KEY, needsOnboarding } from "./onboarding";
import { AutomationsPage } from "./pages/automations";
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
const BOOTSTRAP_KEY = "glanceos.bootstrapped"; // per-session guard for the new-account → fresh-board jump
const GEO_ASKED_KEY = "glanceos.geoAsked"; // one-time guard for the post-login location offer
const browserTz = (): string | null => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } };

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
  const [geoOffer, setGeoOffer] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");

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

  // First-run: a brand-new account (no boards, no screens, not previously dismissed)
  // meets the pick-a-vibe onboarding — "what's this screen for?" hands back a finished,
  // pre-themed board. Someone who already dismissed it but still has no board lands
  // straight in a fresh board instead (never stuck on an empty page). The guide is also
  // reachable from ⌘K. Guarded so it fires at most once per session.
  useEffect(() => {
    if (!status?.authed) return;
    let booted = false;
    try { booted = sessionStorage.getItem(BOOTSTRAP_KEY) === "1"; } catch { /* ignore */ }
    if (booted) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* ignore */ }
    Promise.all([api.get<unknown[]>("/api/layouts"), api.get<unknown[]>("/api/devices")])
      .then(([l, d]) => {
        try { sessionStorage.setItem(BOOTSTRAP_KEY, "1"); } catch { /* ignore */ }
        if (needsOnboarding({ deviceCount: d.length, layoutCount: l.length, dismissed })) { setOnboard(true); return; }
        if (l.length === 0) return api.post<{ id: number }>("/api/layouts", { name: "My first board" }).then((r) => navigate(`/edit/${r.id}`));
      })
      .catch(() => {});
  }, [status?.authed]);

  // One-time, post-login location offer: only when the account has no home set AND
  // the user hasn't already been asked (granted, denied, or dismissed). Never nags —
  // if skipped or denied, it's re-offered from Settings, not here.
  useEffect(() => {
    if (!status?.authed || !status.user) return;
    let asked = false;
    try { asked = localStorage.getItem(GEO_ASKED_KEY) === "1"; } catch { /* ignore */ }
    if (!asked && status.user.homeLatitude == null) setGeoOffer(true);
  }, [status?.authed]);

  const markGeoAsked = () => { try { localStorage.setItem(GEO_ASKED_KEY, "1"); } catch { /* ignore */ } };
  const dismissGeo = () => { markGeoAsked(); setGeoOffer(false); };
  const grantLocation = () => {
    setGeoMsg("");
    if (!navigator.geolocation) { setGeoMsg("This browser can't share a location — add one in Settings."); markGeoAsked(); return; }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let name = "My location";
        try { name = (await api.get<{ name: string }>(`/api/reverse-geocode?lat=${latitude}&lon=${longitude}`)).name || name; } catch { /* keep fallback */ }
        try { await api.patch("/api/account", { home: { name, latitude, longitude }, defaultTimezone: status?.user?.defaultTimezone || browserTz() || undefined }); } catch { /* ignore */ }
        markGeoAsked(); setGeoBusy(false); setGeoOffer(false); refreshAuth();
      },
      () => { setGeoBusy(false); setGeoMsg("Couldn't get your location. You can add it from Settings anytime."); markGeoAsked(); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };

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
          {geoOffer && (
            <div class="geo-offer">
              <div class="geo-offer-text">
                <strong>Set your location</strong>
                <span class="muted">{geoMsg || "Get accurate weather, sunrise/sunset and the right time zone on your screens. Used once — change it anytime in Settings."}</span>
              </div>
              <div class="geo-offer-actions">
                <button class="primary" disabled={geoBusy} onClick={grantLocation}>{geoBusy ? "Locating…" : "Use my location"}</button>
                <button class="ghost" onClick={() => { dismissGeo(); navigate("/account"); }}>Search a city</button>
                <button class="ghost" onClick={dismissGeo}>Not now</button>
              </div>
            </div>
          )}
          {page.name === "boards" && <SetupsPage />}
          {page.name === "screens" && <ScreensPage />}
          {page.name === "groups" && <GroupsPage />}
          {page.name === "playlists" && <PlaylistsPage />}
          {page.name === "hub" && <HubPage />}
          {page.name === "integrations" && <IntegrationsPage />}
          {page.name === "inlets" && <InletsPage />}
          {page.name === "automations" && <AutomationsPage />}
          {page.name === "shared" && <SharedPage />}
          {page.name === "account" && <AccountPage />}
        </main>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      </div>
    </ShellCtx.Provider>
  );
}
