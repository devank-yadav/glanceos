import { useEffect, useState } from "preact/hooks";

// Hand-rolled hash router — six routes don't need a dependency.

export type Route =
  | { name: "login" }
  | { name: "register" }
  | { name: "boards" }
  | { name: "screens" }
  | { name: "fleet" }
  | { name: "groups" }
  | { name: "hub" }
  | { name: "integrations" }
  | { name: "inlets" }
  | { name: "automations" }
  | { name: "shared" }
  | { name: "remote" }
  | { name: "account" }
  | { name: "edit"; layoutId: number };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/login") return { name: "login" };
  if (path === "/register") return { name: "register" };
  if (path === "/boards" || path === "/setups") return { name: "boards" }; // /setups = legacy alias
  if (path === "/screens" || path === "/fleet" || path === "/remote") return { name: "screens" }; // fleet + remote folded into Screens
  if (path === "/groups") return { name: "groups" };
  if (path === "/playlists") return { name: "screens" }; // legacy: rotations folded into board pages
  if (path === "/hub") return { name: "hub" };
  if (path === "/integrations") return { name: "integrations" };
  if (path === "/inlets") return { name: "inlets" };
  if (path === "/automations") return { name: "automations" };
  if (path === "/shared") return { name: "shared" };
  if (path === "/remote") return { name: "remote" };
  if (path === "/account") return { name: "account" };
  const edit = /^\/edit\/(\d+)$/.exec(path);
  if (edit) return { name: "edit", layoutId: Number(edit[1]) };
  return { name: "boards" }; // Boards is home
}

// Path + label for each top-level section, used for breadcrumbs and origin.
export const SECTION: Record<string, { path: string; label: string }> = {
  boards: { path: "#/boards", label: "Boards" },
  screens: { path: "#/screens", label: "Screens" },
  fleet: { path: "#/fleet", label: "Fleet" },
  groups: { path: "#/groups", label: "Groups" },
  hub: { path: "#/hub", label: "Templates" },
  integrations: { path: "#/integrations", label: "Connections" },
  inlets: { path: "#/inlets", label: "Data inlets" },
  automations: { path: "#/automations", label: "Automations" },
  shared: { path: "#/shared", label: "Shared with me" },
  remote: { path: "#/remote", label: "Remote" },
  account: { path: "#/account", label: "Settings" },
};

// Remember the last section the user was on, so a full-screen page (the Studio)
// can show a breadcrumb back to where they actually came from.
let origin = SECTION.boards!;
export function editorOrigin(): { path: string; label: string } {
  return origin;
}
function rememberOrigin(r: Route): void {
  const s = SECTION[r.name];
  if (s) origin = s;
}
if (typeof location !== "undefined") rememberOrigin(parseRoute(location.hash)); // guard: importable in a non-DOM test

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
