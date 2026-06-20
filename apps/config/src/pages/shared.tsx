import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { StatChip } from "../components/StatChip";
import { Icon } from "../editor/icons";
import { navigate } from "../router";

// Boards other accounts have shared with you. Editors can open them in the
// Studio and save; viewers can open read-only. (Screen sharing comes later.)

interface SharedLayout { id: number; name: string; access: "viewer" | "editor"; ownerName: string; widgetCount: number }

export function SharedPage() {
  const [items, setItems] = useState<SharedLayout[] | null>(null);

  useEffect(() => {
    api.get<SharedLayout[]>("/api/shared/layouts").then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <>
      <PageHeader title="Shared with me" />
      <div class="shell-content">
        <p class="muted page-intro">Boards other people on this server have shared with you. Editors can change them; viewers can open them read-only.</p>
        {items === null ? (
          <div class="cards">{[0, 1].map((i) => <div key={i} class="skeleton skeleton-card" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Icon.link />} title="Nothing shared yet" body="When someone shares a board with you, it shows up here." />
        ) : (
          <div class="cards">
            {items.map((s) => (
              <div key={s.id} class="card setup-card">
                <div class="row spread">
                  <h3 class="card-title">{s.name}</h3>
                  <span class={`chip ${s.access === "editor" ? "published" : "subtle"}`}>{s.access}</span>
                </div>
                <div class="chip-row">
                  <StatChip>{s.widgetCount} blocks</StatChip>
                  <StatChip title="Shared by">by {s.ownerName}</StatChip>
                </div>
                <div class="row wrap">
                  <button class="primary" onClick={() => navigate(`/edit/${s.id}`)}>
                    <Icon.pencil /> {s.access === "editor" ? "Open studio" : "Open (read-only)"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
