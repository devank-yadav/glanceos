import { render } from "preact";
import { App } from "./app";
import { PENDING_CLAIM_KEY, parseClaimCode } from "./claim";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { SessionExpired } from "./components/SessionExpired";
import { ToastProvider } from "./components/Toast";
import "./style.css";

// QR pairing deep-link: a scanned screen opens <origin>/?claim=<code>. Stash the
// code for the Screens page to prefill + auto-claim, then strip the query and land
// on Screens — so scanning the on-screen QR actually pairs the display, no typing.
const claimCode = parseClaimCode(location.search);
if (claimCode) {
  try { sessionStorage.setItem(PENDING_CLAIM_KEY, claimCode); } catch { /* ignore */ }
  history.replaceState(null, "", `${location.pathname}#/screens`);
}

// Providers sit above the route split so the lazy Studio chunk can use them too.
render(
  <ToastProvider>
    <ConfirmProvider>
      <App />
      {/* Sibling of <App/> on purpose: app.tsx returns early for the Studio, the
          onboarding wizard and the auth pages, so an overlay rendered inside it
          would be unreachable from exactly the screens that need it most. */}
      <SessionExpired />
    </ConfirmProvider>
  </ToastProvider>,
  document.getElementById("app")!,
);

// PWA: register the SSE-safe service worker (installable + offline shell). Dev
// (Vite) doesn't serve /sw.js, so this is a no-op there and only kicks in on the
// built app served by the server.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {/* PWA is progressive — fine without it */});
  });
}
