import { createContext } from "preact";
import { useCallback, useContext, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Icon } from "../editor/icons";

// Bottom-right toast stack — the one place transient success/error/info messages
// surface, replacing the scattered inline <p class="issues"> strings. aria-live
// so screen readers announce them; errors get role="alert".

type ToastKind = "success" | "error" | "info";
interface Toast { id: number; msg: string; kind: ToastKind }

export interface ToastApi {
  show(msg: string, kind?: ToastKind, ms?: number): void;
  success(msg: string): void;
  error(msg: string): void;
  info(msg: string): void;
}

const ToastCtx = createContext<ToastApi>({
  show: () => {}, success: () => {}, error: () => {}, info: () => {},
});

export const useToast = (): ToastApi => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ComponentChildren }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const api = useMemo<ToastApi>(() => {
    const show = (msg: string, kind: ToastKind = "info", ms?: number) => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, msg, kind }]);
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms ?? (kind === "error" ? 6000 : 4000));
    };
    return {
      show,
      success: (m) => show(m, "success"),
      error: (m) => show(m, "error"),
      info: (m) => show(m, "info"),
    };
  }, []);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div class="toast-stack" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} class={`toast toast-${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
            {t.kind === "error" ? <Icon.warning /> : t.kind === "success" ? <Icon.check /> : <Icon.bell />}
            <span class="toast-msg">{t.msg}</span>
            <button class="icon-btn toast-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}><Icon.x /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
