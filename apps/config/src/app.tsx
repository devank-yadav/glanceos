import type { ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, type AuthStatus } from "./api";
import { AuthPage } from "./auth";
import { HubPage } from "./pages/hub";
import { Landing } from "./pages/landing";
import { PlaylistsPage } from "./pages/playlists";
import { ScreensPage } from "./pages/screens";
import { SetupsPage } from "./pages/setups";
import { useRoute } from "./router";

// The Studio (and zod with it) lives in its own chunk: the shell loads tiny,
// and we warm the chunk during idle time so opening a board feels instant.
let studioModule: Promise<typeof import("./editor/studio")> | null = null;
const loadStudio = () => (studioModule ??= import("./editor/studio"));

function StudioRoute({ layoutId }: { layoutId: number }) {
  const [Studio, setStudio] = useState<ComponentType<{ layoutId: number }> | null>(null);
  useEffect(() => {
    let mounted = true;
    loadStudio().then((m) => {
      if (mounted) setStudio(() => m.Studio);
    });
    return () => {
      mounted = false;
    };
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

export function App() {
  const route = useRoute();
  const [status, setStatus] = useState<AuthStatus | null>(null);

  const refreshAuth = async () => {
    try {
      setStatus(await api.get<AuthStatus>("/api/auth/status"));
    } catch {
      setStatus({ authed: false, user: null, registrationOpen: true });
    }
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  // Warm the Studio chunk once the user is in.
  useEffect(() => {
    if (!status?.authed) return;
    const t = window.setTimeout(loadStudio, 1200);
    return () => window.clearTimeout(t);
  }, [status?.authed]);

  if (!status) return <Splash />;

  if (!status.authed) {
    if (route.name === "login" || route.name === "register") {
      return (
        <AuthPage
          mode={route.name}
          registrationOpen={status.registrationOpen}
          onDone={refreshAuth}
        />
      );
    }
    return <Landing registrationOpen={status.registrationOpen} />;
  }

  const page = route.name === "login" || route.name === "register" ? ({ name: "screens" } as const) : route;

  // The studio is a full-screen surface with its own header.
  if (page.name === "edit") return <StudioRoute layoutId={page.layoutId} />;

  return (
    <main class="shell page-enter">
      <header class="topbar glass">
        <a class="brand" href="#/">
          glanceos
        </a>
        <nav>
          <a href="#/" class={page.name === "screens" ? "active" : ""}>
            Screens
          </a>
          <a href="#/setups" class={page.name === "setups" ? "active" : ""}>
            Setups
          </a>
          <a href="#/playlists" class={page.name === "playlists" ? "active" : ""}>
            Playlists
          </a>
          <a href="#/hub" class={page.name === "hub" ? "active" : ""}>
            Hub
          </a>
        </nav>
        <span class="spacer" />
        <span class="muted">{status.user!.name}</span>
        <button class="ghost" onClick={() => api.post("/api/auth/logout").then(refreshAuth)}>
          Log out
        </button>
      </header>
      {page.name === "screens" && <ScreensPage />}
      {page.name === "setups" && <SetupsPage />}
      {page.name === "playlists" && <PlaylistsPage />}
      {page.name === "hub" && <HubPage />}
    </main>
  );
}
