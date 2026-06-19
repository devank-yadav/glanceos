import { useEffect, useState } from "preact/hooks";

// Hand-rolled hash router — six routes don't need a dependency.

export type Route =
  | { name: "login" }
  | { name: "register" }
  | { name: "screens" }
  | { name: "setups" }
  | { name: "playlists" }
  | { name: "hub" }
  | { name: "integrations" }
  | { name: "edit"; layoutId: number };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/login") return { name: "login" };
  if (path === "/register") return { name: "register" };
  if (path === "/setups") return { name: "setups" };
  if (path === "/playlists") return { name: "playlists" };
  if (path === "/hub") return { name: "hub" };
  if (path === "/integrations") return { name: "integrations" };
  const edit = /^\/edit\/(\d+)$/.exec(path);
  if (edit) return { name: "edit", layoutId: Number(edit[1]) };
  return { name: "screens" };
}

// Path + label for each top-level section, used for breadcrumbs and origin.
export const SECTION: Record<string, { path: string; label: string }> = {
  screens: { path: "#/", label: "Screens" },
  setups: { path: "#/setups", label: "Setups" },
  playlists: { path: "#/playlists", label: "Playlists" },
  hub: { path: "#/hub", label: "Hub" },
  integrations: { path: "#/integrations", label: "Integrations" },
};

// Remember the last section the user was on, so a full-screen page (the Studio)
// can show a breadcrumb back to where they actually came from.
let origin = SECTION.screens!;
export function editorOrigin(): { path: string; label: string } {
  return origin;
}
function rememberOrigin(r: Route): void {
  const s = SECTION[r.name];
  if (s) origin = s;
}
rememberOrigin(parseRoute(location.hash));

export function navigate(path: string): void {
  location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => {
      const r = parseRoute(location.hash);
      rememberOrigin(r);
      setRoute(r);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
