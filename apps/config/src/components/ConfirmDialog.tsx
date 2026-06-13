import { createContext } from "preact";
import { useCallback, useContext, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Modal } from "./Modal";

// useConfirm() → a promise-returning confirm dialog, replacing native confirm()
// and silent deletes. Mount <ConfirmProvider> once near the app root.

interface ConfirmOpts { title: string; body?: string; confirmLabel?: string; danger?: boolean }
type Ask = (opts: ConfirmOpts) => Promise<boolean>;

const Ctx = createContext<Ask>(async () => false);
export const useConfirm = (): Ask => useContext(Ctx);

export function ConfirmProvider({ children }: { children: ComponentChildren }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((o) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setOpts(o);
  }), []);

  const settle = (v: boolean) => { resolver.current?.(v); resolver.current = null; setOpts(null); };

  const value = useMemo(() => ask, [ask]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal open={!!opts} onClose={() => settle(false)} title={opts?.title ?? ""} width={400}>
        {opts?.body && <p class="muted" style={{ marginTop: 0 }}>{opts.body}</p>}
        <div class="row spread" style={{ marginTop: "16px" }}>
          <button class="ghost" onClick={() => settle(false)}>Cancel</button>
          <button class={opts?.danger ? "primary danger-solid" : "primary"} onClick={() => settle(true)}>
            {opts?.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </Modal>
    </Ctx.Provider>
  );
}
