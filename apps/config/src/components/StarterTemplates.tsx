import { useState } from "preact/hooks";
import { api } from "../api";
import { Icon } from "../editor/icons";
import { navigate } from "../router";
import { STARTER_CATEGORIES, STARTER_TEMPLATES, type StarterTemplate } from "../starterTemplates";
import { BoardPreview } from "./BoardPreview";
import { useToast } from "./Toast";

// "Start from a template" gallery: ~50 ready-made full-screen board designs,
// built from the standard blocks (so they cost the screen runtime nothing) and
// rendered live via the same preview iframe the dashboard uses. Picking one
// creates an editable copy in the user's Boards and opens the Studio.
export function StarterTemplates() {
  const [cat, setCat] = useState<string>("All");
  const [busy, setBusy] = useState<string>("");
  const toast = useToast();

  const list = cat === "All" ? STARTER_TEMPLATES : STARTER_TEMPLATES.filter((t) => t.category === cat);

  const use = async (t: StarterTemplate) => {
    setBusy(t.id);
    try {
      const r = await api.post<{ id: number }>("/api/layouts", { name: t.name, document: t.doc });
      navigate(`/edit/${r.id}`);
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
      setBusy("");
    }
  };

  return (
    <section class="starter-section">
      <div class="starter-head">
        <h2 class="section-head">Start from a template</h2>
        <p class="muted">{STARTER_TEMPLATES.length} ready-made full-screen designs — pick one for an editable copy.</p>
        <div class="filter-chips" role="tablist" aria-label="Template categories">
          {["All", ...STARTER_CATEGORIES].map((c) => (
            <button key={c} role="tab" aria-selected={cat === c} class={`filter-chip${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      </div>
      <div class="cards hub-cards">
        {list.map((t) => (
          <div key={t.id} class="card hub-card starter-card">
            <BoardPreview doc={t.doc} deviceName={t.name} />
            <h3 class="card-title">{t.name}</h3>
            {t.description && <p class="hub-desc">{t.description}</p>}
            <div class="row spread hub-foot">
              <span class="chip subtle">{t.category}</span>
              <button class="primary" disabled={busy === t.id} onClick={() => use(t)}><Icon.plus /> {busy === t.id ? "Creating…" : "Use this"}</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
