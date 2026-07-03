import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { Icon } from "../editor/icons";
import { onboardSteps, type OnboardSummary } from "./onboardSteps";

// #122 — a calm first-run checklist on the Boards page: four real steps to a live
// wall, each linking where it happens. Driven by actual counts (not wizard state),
// dismissible, and gone for good the moment all four are true.
const DISMISS_KEY = "glanceos.onboardDismissed";

export function OnboardChecklist() {
  const [sum, setSum] = useState<OnboardSummary | null>(null);
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } });
  useEffect(() => {
    if (!dismissed) api.get<OnboardSummary>("/api/account/data-summary").then(setSum).catch(() => {});
  }, []);
  if (dismissed || !sum) return null;
  const steps = onboardSteps(sum);
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null; // finished → never seen again, no dismiss needed
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage blocked */ } setDismissed(true); };
  return (
    <div class="card onboard-card">
      <div class="row spread">
        <strong>Get to a live wall — {done} of {steps.length}</strong>
        <button class="ghost icon-btn" onClick={dismiss} title="Hide this checklist" aria-label="Dismiss checklist">×</button>
      </div>
      <ul class="onboard-steps">
        {steps.map((s) => (
          <li key={s.key} class={s.done ? "done" : ""}>
            {s.done ? <Icon.check /> : <span class="onboard-dot" aria-hidden="true" />}
            {s.done ? <span>{s.label}</span> : <a href={s.href}>{s.label}</a>}
            <span class="muted"> — {s.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
