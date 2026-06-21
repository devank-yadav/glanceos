import { render } from "preact";
import { App } from "./app";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { ToastProvider } from "./components/Toast";
import "./style.css";

// Providers sit above the route split so the lazy Studio chunk can use them too.
render(
  <ToastProvider>
    <ConfirmProvider>
      <App />
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
