import { useEffect, useRef, useState } from "preact/hooks";
import { api, type HubItem } from "../api";
import { BoardPreview } from "../components/BoardPreview";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { StatChip } from "../components/StatChip";
import { useToast } from "../components/Toast";
import { Icon } from "../editor/icons";

export function HubPage() {
  const [items, setItems] = useState<HubItem[] | null>(null);
  const [q, setQ] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const toast = useToast();

  const search = async (query: string) => {
    try { setItems(await api.get<HubItem[]>(`/api/hub?q=${encodeURIComponent(query)}`)); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  useEffect(() => { search(""); }, []);

  const onSearch = (value: string) => {
    setQ(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => search(value), 300);
  };

  const importItem = async (item: HubItem) => {
    try {
      await api.post(`/api/hub/${item.id}/import`);
      toast.success(`Imported "${item.name}" — it's in your Boards now.`);
      await search(q);
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  const actions = (
    <label class="search-field">
      <Icon.search />
      <input placeholder="Search templates…" value={q} onInput={(e) => onSearch((e.currentTarget as HTMLInputElement).value)} aria-label="Search templates" />
    </label>
  );

  return (
    <>
      <PageHeader title="Templates" actions={actions} />
      <div class="shell-content">
        <p class="muted page-intro">
          Boards shared by everyone on this server. Import one for your own editable copy — publish your own from <a href="#/boards">Boards</a>.
        </p>
        {items === null ? (
          <div class="cards hub-cards">{[0, 1, 2].map((i) => <div key={i} class="skeleton skeleton-card" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Icon.search />} title="No templates found" body={q ? "Try different keywords." : "Be the first — publish a board from your Boards."} />
        ) : (
          <div class="cards hub-cards">
            {items.map((item) => (
              <div key={item.id} class="card hub-card">
                <BoardPreview doc={item.document} deviceName={item.name} />
                <h3 class="card-title">{item.name}</h3>
                <p class="muted hub-byline">by {item.author}</p>
                {item.description && <p class="hub-desc">{item.description}</p>}
                <div class="row spread hub-foot">
                  {item.importCount > 0 ? <StatChip icon={<Icon.download />}>{item.importCount}×</StatChip> : <span />}
                  <button class="primary" onClick={() => importItem(item)}><Icon.download /> Import</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
