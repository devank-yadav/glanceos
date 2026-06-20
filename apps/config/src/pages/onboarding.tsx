import { api } from "../api";
import { ClaimForm } from "../components/ClaimForm";
import { Icon } from "../editor/icons";
import { DISMISS_KEY } from "../onboarding";
import { navigate } from "../router";

// First-run welcome: a fresh account lands here instead of an empty Screens page.
export function Onboarding({ onDone }: { onDone: () => void }) {
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ } onDone(); };
  const createBoard = async () => {
    try { const r = await api.post<{ id: number }>("/api/layouts", { name: "My first board" }); dismiss(); navigate(`/edit/${r.id}`); }
    catch { dismiss(); }
  };
  return (
    <main class="onboard-overlay">
      <div class="onboard-card">
        <div class="brand-mark">glanceos</div>
        <h1>Let's set up your first calm dashboard</h1>
        <ol class="steps-list onboard-steps">
          <li>
            <span class="step-n">1</span>
            <div class="onboard-step-body">
              <strong>Create a board</strong>
              <p class="muted">A board is one screenful — you compose it like a document.</p>
              <button class="primary" onClick={createBoard}><Icon.plus /> Create my first board</button>
            </div>
          </li>
          <li>
            <span class="step-n">2</span>
            <div class="onboard-step-body">
              <strong>Connect a screen <span class="muted">(optional)</span></strong>
              <p class="muted">Open <code>/screen</code> on any display, then enter its claim code.</p>
              <ClaimForm onClaimed={async () => dismiss()} />
            </div>
          </li>
          <li>
            <span class="step-n">3</span>
            <div class="onboard-step-body">
              <strong>Or start from a template</strong>
              <p class="muted">Browse ready-made boards in the hub.</p>
              <button class="ghost" onClick={() => { dismiss(); navigate("/hub"); }}><Icon.convert /> Browse templates</button>
            </div>
          </li>
        </ol>
        <button class="ghost onboard-skip" onClick={dismiss}>Skip for now</button>
      </div>
    </main>
  );
}
