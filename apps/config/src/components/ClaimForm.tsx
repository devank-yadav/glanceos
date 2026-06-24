import { useEffect, useRef, useState } from "preact/hooks";
import { api, type DeviceSummary } from "../api";
import { useToast } from "./Toast";

// Claim a screen by its code. Extracted from the Screens page so the onboarding
// wizard can reuse the exact same flow. `initialCode` arrives from a scanned QR
// pairing deep-link — when present the form prefills and auto-submits (no typing).
export function ClaimForm({ onClaimed, initialCode }: { onClaimed: (deviceId: string) => Promise<void>; initialCode?: string }) {
  const [code, setCode] = useState(initialCode ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const autoSubmitted = useRef(false);

  const claim = async () => {
    if (busy || code.trim().length < 4) return;
    setBusy(true);
    try {
      const device = await api.post<DeviceSummary>("/api/devices/claim", { code, name: name.trim() || undefined });
      toast.success("Screen connected");
      await onClaimed(device.id);
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  };

  // Auto-submit once when prefilled from a scanned QR — the whole point of the
  // deep-link is that pairing needs no typing. A failure leaves the code in place
  // to retry/edit.
  useEffect(() => {
    if (initialCode && initialCode.trim().length >= 4 && !autoSubmitted.current) {
      autoSubmitted.current = true;
      void claim();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <label class="field grow">
        <span>Claim code</span>
        <input placeholder="7QK-D2F" value={code} onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && claim()} />
      </label>
      <label class="field grow">
        <span>Screen name <span class="muted">(optional)</span></span>
        <input placeholder="Desk monitor" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
        <button class="primary" disabled={code.trim().length < 4 || busy} onClick={claim}>{busy ? "Connecting…" : "Claim screen"}</button>
      </div>
    </>
  );
}
