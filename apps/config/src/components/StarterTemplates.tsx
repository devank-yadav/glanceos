import type { LayoutT } from "@glanceos/schema";
import { useEffect, useState } from "preact/hooks";
import { api, type HubItem, type SetupSummary } from "../api";
import { Icon } from "../editor/icons";
import { navigate } from "../router";
import { STARTER_CATEGORIES, STARTER_TEMPLATES } from "../starterTemplates";
import { filterTemplates } from "../templateSearch";
import { BoardPreview, BoardPreviewById } from "./BoardPreview";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

// The Templates gallery: the built-in starters PLUS approved community templates,
// shown as the same tiles. Owners submit a board for review (admin-moderated);
// once approved it appears here alongside the starters. "View" opens a larger
// preview; "Copy template" drops an editable copy into the user's Boards.

type GalleryItem = { key: string; name: string; category: string; description: string; doc: LayoutT; kind: "starter" | "community"; hubId?: number };

const COMMUNITY = "Community";

export function StarterTemplates({ publishing, onClosePublish }: { publishing: boolean; onClosePublish: () => void }) {
  const [cat, setCat] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<GalleryItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [community, setCommunity] = useState<HubItem[]>([]);
  const toast = useToast();

  // Approved community templates show alongside the starters. Submissions wait in
  // a server-side review queue ("the Glance team") — the in-app review/admin
  // surface is a later phase, so there's no moderation UI here yet.
  const loadCommunity = () => api.get<HubItem[]>("/api/hub").then(setCommunity).catch(() => {});
  useEffect(() => { loadCommunity(); }, []);

  const items: GalleryItem[] = [
    ...STARTER_TEMPLATES.map((t) => ({ key: `s-${t.id}`, name: t.name, category: t.category, description: t.description, doc: t.doc, kind: "starter" as const })),
    ...community.map((c) => ({ key: `c-${c.id}`, name: c.name, category: COMMUNITY, description: c.description, doc: c.document, kind: "community" as const, hubId: c.id })),
  ];
  const categories = ["All", ...STARTER_CATEGORIES, ...(community.length ? [COMMUNITY] : [])];
  const list = filterTemplates(items, cat, query);

  const copy = async (t: GalleryItem) => {
    setBusy(true);
    try {
      if (t.kind === "community" && t.hubId != null) await api.post(`/api/hub/${t.hubId}/import`);
      else await api.post("/api/layouts", { name: t.name, document: t.doc });
      toast.success(`"${t.name}" copied to your Boards`);
      setViewing(null);
      navigate("/boards");
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="starter-section">
      <div class="row spread starter-toolbar">
        <div class="filter-chips" role="tablist" aria-label="Template categories">
          {categories.map((c) => (
            <button key={c} role="tab" aria-selected={cat === c} class={`filter-chip${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <input
          class="integ-search"
          type="search"
          aria-label="Search templates"
          placeholder={`Search ${items.length} templates…`}
          value={query}
          onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
        />
      </div>

      {list.length === 0 ? (
        <p class="muted">No templates match {query.trim() ? `“${query.trim()}”` : "that filter"}.</p>
      ) : (
      <div class="cards hub-cards">
        {list.map((t) => (
          <div key={t.key} class="card hub-card starter-card">
            <button class="starter-view-hit" title={`Preview ${t.name}`} aria-label={`Preview ${t.name}`} onClick={() => setViewing(t)}>
              <BoardPreview doc={t.doc} deviceName={t.name} />
            </button>
            <div class="hub-card-body">
              <h3 class="card-title" title={t.name}>{t.name}</h3>
              {t.description && <p class="hub-desc">{t.description}</p>}
              <div class="row spread hub-foot">
                <span class="chip subtle">{t.category}</span>
                <button class="primary" onClick={() => setViewing(t)}><Icon.eye /> View</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name ?? "Template"} size="full">
        {viewing && (
          <div class="starter-detail">
            <div class="starter-detail-preview">
              <BoardPreview doc={viewing.doc} deviceName={viewing.name} />
            </div>
            <div class="row spread starter-detail-meta">
              <span class="chip subtle">{viewing.category}</span>
            </div>
            {viewing.description && <p class="muted starter-detail-desc">{viewing.description}</p>}
            <div class="row starter-detail-actions">
              <button class="ghost" onClick={() => setViewing(null)}>Cancel</button>
              <button class="primary" disabled={busy} onClick={() => copy(viewing)}><Icon.copy /> {busy ? "Copying…" : "Copy template"}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={publishing} onClose={onClosePublish} title="Publish a board to Templates">
        {publishing && <PublishBoard onClose={onClosePublish} onDone={onClosePublish} />}
      </Modal>
    </section>
  );
}

// Pick one of your boards (with a live preview) and submit it for review.
function PublishBoard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [boards, setBoards] = useState<SetupSummary[] | null>(null);
  const [picked, setPicked] = useState<SetupSummary | null>(null);
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => { api.get<SetupSummary[]>("/api/layouts").then(setBoards).catch(() => setBoards([])); }, []);

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await api.post(`/api/layouts/${picked.id}/publish`, { description: desc.trim() });
      toast.success("Submitted — the Glance team will review it before it goes live in Templates.");
      onDone();
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); setBusy(false); }
  };

  if (boards === null) return <p class="muted">Loading your boards…</p>;
  if (boards.length === 0) return <p class="muted">You have no boards yet — create one first, then publish it here.</p>;

  return (
    <div class="publish-board">
      <p class="muted" style={{ marginTop: 0 }}>Choose a board to share with everyone on this server. It goes live in Templates once the Glance team reviews it.</p>
      {/* the grid scrolls inside a fixed height so the footer (and Submit) is always
          reachable even with dozens of boards */}
      <div class="cards publish-grid">
        {boards.map((b) => (
          <button key={b.id} class={`card hub-card publish-pick${picked?.id === b.id ? " on" : ""}`} onClick={() => setPicked(b)}>
            <BoardPreviewById layoutId={b.id} name={b.name} />
            <div class="hub-card-body"><h3 class="card-title" title={b.name}>{b.name}</h3></div>
          </button>
        ))}
      </div>
      <div class="publish-foot">
        <label class="field grow">
          <span>{picked ? `Description for “${picked.name}” (optional)` : "Pick a board above to publish"}</span>
          <input value={desc} maxLength={280} disabled={!picked} placeholder="What is this board for?" onInput={(e) => setDesc((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <div class="row starter-detail-actions">
          <button class="ghost" onClick={onClose}>Cancel</button>
          <button class="primary" disabled={!picked || busy} onClick={submit}><Icon.upload /> {busy ? "Submitting…" : "Submit for review"}</button>
        </div>
      </div>
    </div>
  );
}
