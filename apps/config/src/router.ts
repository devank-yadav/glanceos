import { useEffect, useState } from "preact/hooks";

// Hand-rolled hash router — six routes don't need a dependency.

export type Route =
  | { name: "login" }
  | { name: "register" }
  | { name: "screens" }
  | { name: "setups" }
  | { name: "playlists" }
  | { name: "hub" }
  | { name: "edit"; layoutId: number };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/login") return { name: "login" };
  if (path === "/register") return { name: "register" };
  if (path === "/setups") return { name: "setups" };
  if (path === "/playlists") return { name: "playlists" };
  if (path === "/hub") return { name: "hub" };
  const edit = /^\/edit\/(\d+)$/.exec(path);
  if (edit) return { name: "edit", layoutId: Number(edit[1]) };
  return { name: "screens" };
}

export function navigate(path: string): void {
  location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
