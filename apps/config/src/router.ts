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
  | { name: "members" }
  | { name: "metrics" }
  | { name: "invite"; token: string }
  | { name: "forgot" }
  | { name: "reset"; token: string }
  | { name: "verified" }
  | { name: "edit"; layoutId: number };

// Split out from parseRoute so callers can ask "is this hash a real app route?"
// without the Boards fallback answering yes to everything. Returns null for an
// in-page anchor (#features) or an unknown path.
function matchRoute(path: string): Route | null {
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
  if (path === "/members" || path === "/team") return { name: "members" };
  if (path === "/metrics") return { name: "metrics" };
  if (path === "/forgot") return { name: "forgot" };
  if (path === "/verified") return { name: "verified" };
  const reset = /^\/reset\/([A-Za-z0-9]+)$/.exec(path);
  if (reset) return { name: "reset", token: reset[1]! };
  const invite = /^\/invite\/([A-Za-z0-9]+)$/.exec(path);
  if (invite) return { name: "invite", token: invite[1]! };
  const edit = /^\/edit\/(\d+)$/.exec(path);
  if (edit) return { name: "edit", layoutId: Number(edit[1]) };
  return null;
}

// Strip any ?query and trailing #fragment before matching: the server's own
// verification bounce lands on "#/verified?expired=1", and strict equality against
// the raw hash matched nothing — so both branches of VerifiedPage were unreachable.
function hashPath(hash: string): string {
  return hash.replace(/^#/, "").split(/[?#]/)[0] || "/";
}

export function parseRoute(hash: string): Route {
  return matchRoute(hashPath(hash)) ?? { name: "boards" }; // Boards is home
}

// True only for a hash the router actually recognizes. Landing anchors (#features,
// #pricing) have no leading slash and are deliberately excluded — gating on them
// would throw a logged-out visitor reading the marketing page into the sign-in card.
export function isAppRoute(hash: string): boolean {
  const path = hashPath(hash);
  return path.startsWith("/") && matchRoute(path) !== null;
}

// Where the user was actually trying to go when we made them log in first. Kept in
// memory only — never a query parameter, so it can't be crafted, mailed, or logged,
// and it is fed to location.hash, which cannot leave this origin.
let intended: string | null = null;

export function rememberIntended(hash: string): void {
  const path = hashPath(hash);
  // Same-origin hash paths only: one leading slash, no scheme, no protocol-relative.
  if (!path.startsWith("/") || path.startsWith("//") || path.includes(":")) return;
  if (!isAppRoute(hash)) return;
  intended = path;
}

export function consumeIntended(): string | null {
  const next = intended;
  intended = null;
  if (next) deepLinked = true;
  return next;
}

// Sticky, unlike `intended`: auth.tsx consumes the destination synchronously right
// after login, which is BEFORE Preact flushes the effects that want to know whether
// this was a deep-link arrival. A flag that outlives the consume is the only thing
// those effects can read reliably.
let deepLinked = false;

export function arrivedViaDeepLink(): boolean {
  return deepLinked;
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
  members: { path: "#/members", label: "Team" },
  metrics: { path: "#/metrics", label: "Metrics" },
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
