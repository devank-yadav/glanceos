import { useEffect, useMemo, useState } from "preact/hooks";
import { api, type LayoutRecord, type SetupSummary } from "../api";
import { BoardPreviewById } from "../components/BoardPreview";
import { useConfirm } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { Menu } from "../components/Menu";
import { OnboardChecklist } from "../components/OnboardChecklist";
import { ShareDialog } from "../components/ShareDialog";
import { PageHeader } from "../components/PageHeader";
import { StatChip } from "../components/StatChip";
import { useToast } from "../components/Toast";
import { Icon } from "../editor/icons";
import { navigate } from "../router";

interface SharedLayout { id: number; name: string; access: "viewer" | "editor"; ownerName: string; widgetCount: number }

// #106 — favorite/pin boards. A personal, per-device UI preference (like recent blocks &
// snippets), so it lives in localStorage — no server, no migration. Pinned boards float into a
// "Favorites" section at the top for one-click access regardless of folder.
const FAV_KEY = "glanceos.favoriteBoards";
function loadFavs(): Set<number> {
  try { const a = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as unknown; return new Set(Array.isArray(a) ? a.filter((n): n is number => typeof n === "number") : []); }
  catch { return new Set(); }
}
function useFavorites() {
  const [favs, setFavs] = useState<Set<number>>(() => loadFavs());
  const toggle = (id: number) =>
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch { /* storage full/blocked — keep in-memory */ }
      return next;
    });
  return { favs, toggle };
}

// #105 — board sort. Client-side over the fields the list already carries (no backend), persisted
// per-device like favorites. Sorting orders boards within the Favorites section + each folder.
const BOARD_SORTS: Record<string, (a: SetupSummary, b: SetupSummary) => number> = {
  "name-asc": (a, b) => a.name.localeCompare(b.name),
  "name-desc": (a, b) => b.name.localeCompare(a.name),
  used: (a, b) => b.usedBy - a.usedBy || a.name.localeCompare(b.name),
  newest: (a, b) => b.id - a.id,
};
const SORT_LABELS: [string, string][] = [["name-asc", "Name (A–Z)"], ["name-desc", "Name (Z–A)"], ["used", "Most used"], ["newest", "Newest"]];
const SORT_KEY = "glanceos.boardSort";

export function SetupsPage() {
  const [tab, setTab] = useState<"mine" | "shared">("mine");
  const [setups, setSetups] = useState<SetupSummary[] | null>(null);
  const [shared, setShared] = useState<SharedLayout[] | null>(null);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const { favs, toggle: toggleFav } = useFavorites();
  const toast = useToast();

  const refresh = async () => {
    try { setSetups(await api.get<SetupSummary[]>(`/api/layouts${showArchived ? "?archived=1" : ""}`)); }
    catch (e) { toast.error(`Couldn't load boards: ${e instanceof Error ? e.message : e}`); }
  };
  useEffect(() => { setSetups(null); refresh(); }, [showArchived]); // #107 — reload when toggling the archive view
  useEffect(() => {
    if (tab === "shared" && shared === null) api.get<SharedLayout[]>("/api/shared/layouts").then(setShared).catch(() => setShared([]));
  }, [tab]);

  const newBoard = async () => {
    try { const r = await api.post<{ id: number }>("/api/layouts", { name: "Untitled board" }); navigate(`/edit/${r.id}`); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  const [sort, setSort] = useState(() => { try { return localStorage.getItem(SORT_KEY) || "name-asc"; } catch { return "name-asc"; } });
  const chooseSort = (v: string) => { setSort(v); try { localStorage.setItem(SORT_KEY, v); } catch { /* storage blocked — keep in-memory */ } };

  const filtered = useMemo(() => {
    const list = (setups ?? []).filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase()));
    return list.sort(BOARD_SORTS[sort] ?? BOARD_SORTS["name-asc"]); // #105 — sort flows into favorites + folders
  }, [setups, q, sort]);

  const actions = (
    <>
      {tab === "mine" && (
        <label class="search-field">
          <Icon.search />
          <input placeholder="Search boards…" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} aria-label="Search boards" />
        </label>
      )}
      {tab === "mine" && (
        <select class="board-sort" value={sort} onChange={(e) => chooseSort((e.currentTarget as HTMLSelectElement).value)} aria-label="Sort boards" title="Sort boards">
          {SORT_LABELS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      )}
      {tab === "mine" && (
        <button onClick={() => setShowArchived((v) => !v)} aria-pressed={showArchived} title={showArchived ? "Back to active boards" : "View archived boards"}>
          {showArchived ? <><Icon.chevron /> Active boards</> : <><Icon.eyeOff /> Archived</>}
        </button>
      )}
      <button class="primary" onClick={newBoard}><Icon.plus /> New board</button>
    </>
  );

  return (
    <>
      <PageHeader title="Boards" actions={actions} />
      <div class="shell-content">
        <div class="tabs" role="tablist">
          <button class={`tab ${tab === "mine" ? "on" : ""}`} role="tab" aria-selected={tab === "mine"} onClick={() => setTab("mine")}>My boards</button>
          <button class={`tab ${tab === "shared" ? "on" : ""}`} role="tab" aria-selected={tab === "shared"} onClick={() => setTab("shared")}>Shared with me</button>
        </div>

        {tab === "mine" ? (
          <>
            <p class="muted page-intro">
              {showArchived
                ? "Archived boards are tucked away here — hidden from your board list and from screen pickers, but kept safe. Restore one anytime from its ⋯ menu."
                : "A board is a dashboard you design once and show on any screen — disconnect a screen and its board survives; show one board on many screens and they stay in step."}
            </p>
            {!showArchived && <OnboardChecklist />}
            {setups === null ? (
              <div class="cards">{[0, 1, 2].map((i) => <div key={i} class="skeleton skeleton-card" />)}</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={showArchived ? <Icon.eyeOff /> : <Icon.pencil />}
                title={q ? "No boards match" : showArchived ? "No archived boards" : "No boards yet"}
                body={q ? "Try a different search." : showArchived ? "Archive a board from its ⋯ menu to tuck it away here." : "Create your first board, or start from a template."}
                action={q || showArchived ? undefined : { label: "New board", onClick: newBoard }}
              />
            ) : showArchived ? (
              <div class="cards">{filtered.map((s) => <SetupCard key={s.id} setup={s} folders={[]} onChanged={refresh} isFav={favs.has(s.id)} onToggleFav={() => toggleFav(s.id)} />)}</div>
            ) : (() => {
              // #104 — group boards by folder (sorted; Unfiled last). Folder headings only
              // appear once at least one board has a folder, so the flat list is unchanged
              // for people who never use them.
              const folders = [...new Set((setups ?? []).map((s) => s.folder).filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b));
              const groups = [
                ...folders.map((f) => ({ folder: f as string | null, items: filtered.filter((s) => s.folder === f) })),
                { folder: null as string | null, items: filtered.filter((s) => !s.folder) },
              ].filter((g) => g.items.length > 0);
              const card = (s: SetupSummary) => <SetupCard key={s.id} setup={s} folders={folders} onChanged={refresh} isFav={favs.has(s.id)} onToggleFav={() => toggleFav(s.id)} />;
              // #106 — pinned boards surface in a Favorites section at the top, for one-click reach
              // regardless of folder; they still appear in their folder section below.
              const favItems = filtered.filter((s) => favs.has(s.id));
              return (
                <>
                  {favItems.length > 0 && (
                    <section class="board-folder">
                      <h3 class="folder-heading"><Icon.pin /> Favorites <span class="muted">· {favItems.length}</span></h3>
                      <div class="cards">{favItems.map(card)}</div>
                    </section>
                  )}
                  {groups.map((g) => (
                    <section key={g.folder ?? "_unfiled"} class="board-folder">
                      {folders.length > 0 && <h3 class="folder-heading"><Icon.layers /> {g.folder ?? "Unfiled"} <span class="muted">· {g.items.length}</span></h3>}
                      <div class="cards">{g.items.map(card)}</div>
                    </section>
                  ))}
                </>
              );
            })()}
          </>
        ) : (
          <SharedBoards items={shared} />
        )}
      </div>
    </>
  );
}

// Boards other accounts have shared with me (was the separate "Shared with me" page).
function SharedBoards({ items }: { items: SharedLayout[] | null }) {
  if (items === null) return <div class="cards">{[0, 1].map((i) => <div key={i} class="skeleton skeleton-card" />)}</div>;
  if (items.length === 0) return <EmptyState icon={<Icon.copy />} title="Nothing shared yet" body="When someone shares a board with you, it shows up here." />;
  return (
    <div class="cards">
      {items.map((s) => (
        <div key={s.id} class="card setup-card">
          <div class="row spread">
            <h3 class="card-title">{s.name}</h3>
            <span class={`chip ${s.access === "editor" ? "published" : "subtle"}`}>{s.access}</span>
          </div>
          <button class="board-preview-link" onClick={() => navigate(`/edit/${s.id}`)} title="Open" aria-label={`Open ${s.name}`}>
            <BoardPreviewById layoutId={s.id} name={s.name} />
          </button>
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
  );
}

function SetupCard({ setup, folders, onChanged, isFav, onToggleFav }: { setup: SetupSummary; folders: string[]; onChanged: () => Promise<void>; isFav: boolean; onToggleFav: () => void }) {
  const [sharing, setSharing] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  // #104 — move this board into a folder (null = remove from folder).
  const moveTo = async (folder: string | null) => {
    await api.patch(`/api/layouts/${setup.id}`, { folder });
    toast.success(folder ? `Moved to "${folder}"` : "Removed from folder");
    await onChanged();
  };
  const newFolder = async () => {
    const f = window.prompt("New folder name")?.trim();
    if (f) await moveTo(f);
  };

  const exportJson = async () => {
    const record = await api.get<LayoutRecord>(`/api/layouts/${setup.id}`);
    const blob = new Blob([JSON.stringify(record.document, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${setup.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.glanceos.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Exported");
  };

  // #107 — archive (soft-delete) or restore; archived boards leave the main list + pickers.
  const setArchivedFn = async (archived: boolean) => {
    await api.patch(`/api/layouts/${setup.id}`, { archived });
    toast.success(archived ? "Board archived" : "Board restored");
    await onChanged();
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete "${setup.name}"?`,
      body: setup.usedBy > 0 ? `It is live on ${setup.usedBy} screen(s); they'll fall back to "pick a board".` : "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await api.del(`/api/layouts/${setup.id}`);
    toast.success("Board deleted");
    await onChanged();
  };

  return (
    <div class="card setup-card">
      <button class="board-preview-link" onClick={() => navigate(`/edit/${setup.id}`)} title="Edit board" aria-label={`Edit ${setup.name}`}>
        <BoardPreviewById layoutId={setup.id} name={setup.name} />
      </button>
      <div class="setup-card-body">
        <div class="row spread">
          <h3 class="card-title" title={setup.name}>{setup.name}</h3>
          <div class="row" style={{ gap: "2px" }}>
          <button type="button" class={`fav-btn${isFav ? " is-fav" : ""}`} onClick={onToggleFav} aria-pressed={isFav} aria-label={isFav ? "Unpin board" : "Pin board"} title={isFav ? "Unpin from favorites" : "Pin to favorites"}><Icon.pin /></button>
          <Menu
            trigger={<Icon.more />}
            items={[
              { label: "Share…", icon: <Icon.link />, onClick: () => setSharing(true) },
              { label: "Duplicate", icon: <Icon.copy />, onClick: () => api.post(`/api/layouts/${setup.id}/duplicate`).then(() => { toast.success("Duplicated"); return onChanged(); }) },
              { label: "Export JSON", icon: <Icon.download />, onClick: exportJson },
              // #44 — a live full-color PNG of the board (rendered server-side; same-origin
              // GET so the session cookie rides along and the browser saves the download).
              { label: "Download snapshot", icon: <Icon.download />, onClick: () => { window.location.href = `/api/layouts/${setup.id}/snapshot.png`; } },
              ...folders.filter((f) => f !== setup.folder).map((f) => ({ label: `Move to "${f}"`, icon: <Icon.layers />, onClick: () => moveTo(f) })),
              { label: "Move to new folder…", icon: <Icon.plus />, onClick: newFolder },
              ...(setup.folder ? [{ label: "Remove from folder", icon: <Icon.x />, onClick: () => moveTo(null) }] : []),
              setup.archived
                ? { label: "Restore", icon: <Icon.eye />, onClick: () => setArchivedFn(false) }
                : { label: "Archive", icon: <Icon.eyeOff />, onClick: () => setArchivedFn(true) },
              { label: "Delete", icon: <Icon.trash />, danger: true, onClick: remove },
            ]}
          />
          </div>
        </div>
        {setup.usedBy > 0 ? (
          <p class="tile-status live" title={setup.deviceNames.join(", ")}>
            <span class="status-dot live" aria-hidden="true" />
            Live on {setup.deviceNames.length ? setup.deviceNames.join(", ") : `${setup.usedBy} screen${setup.usedBy > 1 ? "s" : ""}`}
          </p>
        ) : (
          <p class="tile-status muted"><span class="status-dot" aria-hidden="true" /> Not on a screen</p>
        )}
      </div>
      {sharing && <ShareDialog kind="layout" targetId={String(setup.id)} targetName={setup.name} onClose={() => setSharing(false)} />}
    </div>
  );
}
