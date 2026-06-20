import { useState } from "preact/hooks";
import { api, type DeviceSummary } from "../api";
import { useToast } from "./Toast";

// Claim a screen by its code. Extracted from the Screens page so the onboarding
// wizard can reuse the exact same flow.
export function ClaimForm({ onClaimed }: { onClaimed: (deviceId: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const toast = useToast();

  const claim = async () => {
    try {
      const device = await api.post<DeviceSummary>("/api/devices/claim", { code, name: name.trim() || undefined });
      toast.success("Screen connected");
      await onClaimed(device.id);
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  return (
    <>
      <label class="field grow">
        <span>Claim code</span>
        <input placeholder="7QK-D2F" value={code} autoFocus onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && code.trim().length >= 4 && claim()} />
      </label>
      <label class="field grow">
        <span>Screen name <span class="muted">(optional)</span></span>
        <input placeholder="Desk monitor" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <div class="row spread" style={{ marginTop: "4px" }}>
        <span />
        <button class="primary" disabled={code.trim().length < 4} onClick={claim}>Claim screen</button>
      </div>
    </>
  );
}
