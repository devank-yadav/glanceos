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
