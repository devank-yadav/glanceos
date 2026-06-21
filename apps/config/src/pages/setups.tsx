import { useEffect, useMemo, useState } from "preact/hooks";
import { api, type LayoutRecord, type SetupSummary } from "../api";
import { BoardPreviewById } from "../components/BoardPreview";
import { useConfirm } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { Menu } from "../components/Menu";
import { ShareDialog } from "../components/ShareDialog";
import { PageHeader } from "../components/PageHeader";
import { StatChip } from "../components/StatChip";
import { useToast } from "../components/Toast";
import { Icon } from "../editor/icons";
import { navigate } from "../router";

interface SharedLayout { id: number; name: string; access: "viewer" | "editor"; ownerName: string; widgetCount: number }

export function SetupsPage() {
  const [tab, setTab] = useState<"mine" | "shared">("mine");
  const [setups, setSetups] = useState<SetupSummary[] | null>(null);
  const [shared, setShared] = useState<SharedLayout[] | null>(null);
  const [q, setQ] = useState("");
  const toast = useToast();

  const refresh = async () => {
    try { setSetups(await api.get<SetupSummary[]>("/api/layouts")); }
    catch (e) { toast.error(`Couldn't load boards: ${e instanceof Error ? e.message : e}`); }
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (tab === "shared" && shared === null) api.get<SharedLayout[]>("/api/shared/layouts").then(setShared).catch(() => setShared([]));
  }, [tab]);

  const newBoard = async () => {
    try { const r = await api.post<{ id: number }>("/api/layouts", { name: "Untitled board" }); navigate(`/edit/${r.id}`); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  const filtered = useMemo(
    () => (setups ?? []).filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())),
    [setups, q],
  );

  const actions = (
    <>
      {tab === "mine" && (
        <label class="search-field">
          <Icon.search />
          <input placeholder="Search boards…" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} aria-label="Search boards" />
        </label>
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
              A board is a dashboard you design once and show on any screen — disconnect a screen and its board survives;
              show one board on many screens and they stay in step.
            </p>
            {setups === null ? (
              <div class="cards">{[0, 1, 2].map((i) => <div key={i} class="skeleton skeleton-card" />)}</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<Icon.pencil />}
                title={q ? "No boards match" : "No boards yet"}
                body={q ? "Try a different search." : "Create your first board, or start from a template."}
                action={q ? undefined : { label: "New board", onClick: newBoard }}
              />
            ) : (
              <div class="cards">
                {filtered.map((s) => <SetupCard key={s.id} setup={s} onChanged={refresh} />)}
              </div>
            )}
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

function SetupCard({ setup, onChanged }: { setup: SetupSummary; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [description, setDescription] = useState(setup.description);
  const toast = useToast();
  const confirm = useConfirm();

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

  const togglePublish = async () => {
    setBusy(true);
    try {
      await api.patch(`/api/layouts/${setup.id}`, { published: !setup.published, description });
      toast.success(setup.published ? "Removed from hub" : "Published to hub");
      setPublishing(false);
      await onChanged();
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
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
          <Menu
            trigger={<Icon.more />}
            items={[
              { label: "Share…", icon: <Icon.link />, onClick: () => setSharing(true) },
              { label: "Duplicate", icon: <Icon.copy />, onClick: () => api.post(`/api/layouts/${setup.id}/duplicate`).then(() => { toast.success("Duplicated"); return onChanged(); }) },
              { label: "Export JSON", icon: <Icon.download />, onClick: exportJson },
              { label: setup.published ? "Hub settings" : "Publish to hub…", icon: <Icon.upload />, onClick: () => setPublishing((v) => !v) },
              { label: "Delete", icon: <Icon.trash />, danger: true, onClick: remove },
            ]}
          />
        </div>
        <div class="chip-row">
          <StatChip>{setup.widgetCount} blocks</StatChip>
          <StatChip>{setup.rowCount} lines</StatChip>
          {setup.usedBy > 0 ? <StatChip icon={<Icon.monitor />} title={setup.deviceNames.join(", ")}>live on {setup.usedBy}</StatChip> : <span class="chip subtle">not attached</span>}
          {setup.published && <span class="chip published">in hub</span>}
          {setup.importCount > 0 && <StatChip>imported {setup.importCount}×</StatChip>}
        </div>
        <div class="row wrap">
          <button class="primary" onClick={() => navigate(`/edit/${setup.id}`)}><Icon.pencil /> Edit</button>
        </div>
      </div>
      {publishing && (
        <div class="publish-row">
          <label class="field grow">
            <span>Hub description</span>
            <input value={description} placeholder="What is this board for?" onInput={(e) => setDescription((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <button disabled={busy} onClick={togglePublish}>{setup.published ? "Unpublish" : "Publish"}</button>
        </div>
      )}
      {sharing && <ShareDialog kind="layout" targetId={String(setup.id)} targetName={setup.name} onClose={() => setSharing(false)} />}
    </div>
  );
}
