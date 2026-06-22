import { useEffect, useState } from "preact/hooks";
import { api, type DisplayGroup, type SetupSummary } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { ScreensTabs } from "../components/ScreensTabs";
import { TimezoneSelect } from "../components/TimezoneSelect";
import { useToast } from "../components/Toast";
import { Icon } from "../editor/icons";

// Display groups: manage many screens as one. A group has a default board (or
// playlist) its members fall back to; assign screens to a group on the Screens
// page. (Per-group time-of-day schedules are supported by the API; a dedicated
// editor is a small follow-up.)
export function GroupsPage() {
  const [groups, setGroups] = useState<DisplayGroup[] | null>(null);
  const [setups, setSetups] = useState<SetupSummary[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const refresh = async () => {
    const [g, s] = await Promise.all([api.get<DisplayGroup[]>("/api/groups"), api.get<SetupSummary[]>("/api/layouts")]);
    setGroups(g); setSetups(s); setError(false);
  };
  useEffect(() => { refresh().catch(() => setError(true)); }, []); // a failed load is an error, not "no groups"

  const create = async () => {
    if (!name.trim()) return;
    try { await api.post("/api/groups", { name: name.trim() }); setName(""); toast.success("Group created"); await refresh(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  return (
    <>
      <PageHeader title="Groups" actions={
        <span class="row" style={{ gap: "6px" }}>
          <input placeholder="New group name" value={name} maxLength={60} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <button class="primary" disabled={!name.trim()} onClick={create}><Icon.plus /> Create</button>
        </span>
      } />
      <div class="shell-content">
        <ScreensTabs active="groups" />
        <p class="muted page-intro" style={{ marginTop: 0 }}>A group gives many screens one default board. Assign a screen to a group from its card on <a href="#/screens">Screens</a>.</p>
        {groups === null && error ? <EmptyState icon={<Icon.layers />} title="Couldn't load groups" body="The server may be unreachable." action={{ label: "Try again", onClick: () => { setError(false); refresh().catch(() => setError(true)); } }} />
          : groups === null ? <div class="group-list">{[0, 1].map((i) => <div key={i} class="skeleton skeleton-card" />)}</div>
            : groups.length === 0 ? <EmptyState icon={<Icon.layers />} title="No groups yet" body="Create a group to manage several screens together — a lobby, a floor, a whole building." />
              : <div class="group-list">{groups.map((g) => <GroupCard key={g.id} group={g} setups={setups} onChanged={refresh} confirm={confirm} toast={toast} />)}</div>}
      </div>
    </>
  );
}

function GroupCard({ group, setups, onChanged, confirm, toast }: {
  group: DisplayGroup; setups: SetupSummary[]; onChanged: () => Promise<void>;
  confirm: ReturnType<typeof useConfirm>; toast: ReturnType<typeof useToast>;
}) {
  const [name, setName] = useState(group.name);
  const [tz, setTz] = useState(group.timezone ?? "");

  const patch = async (body: Record<string, unknown>) => {
    try { await api.patch(`/api/groups/${group.id}`, body); await onChanged(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const del = async () => {
    if (!(await confirm({ title: `Delete "${group.name}"?`, body: "Its screens keep their own settings; they just leave the group.", confirmLabel: "Delete", danger: true }))) return;
    try { await api.del(`/api/groups/${group.id}`); toast.success("Group deleted"); await onChanged(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const command = async (cmd: string, params?: Record<string, unknown>) => {
    try {
      const r = await api.post<{ delivered: number }>(`/api/groups/${group.id}/command`, { command: cmd, params });
      toast.success(`${cmd} → ${r.delivered} live screen${r.delivered === 1 ? "" : "s"}`);
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  return (
    <div class="card group-card">
      <div class="row spread">
        <input class="group-name" value={name} maxLength={60}
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
          onBlur={() => name.trim() && name !== group.name && patch({ name: name.trim() })}
          onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }} />
        <button class="ghost danger icon-btn" title="Delete group" onClick={del}><Icon.trash /></button>
      </div>
      <p class="muted">{group.deviceCount} screen{group.deviceCount === 1 ? "" : "s"}</p>
      <label class="field grow">
        <span>Default board</span>
        <select value={group.layoutId ?? ""} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; patch({ layoutId: v ? Number(v) : null }); }}>
          <option value="">None</option>
          {setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label class="field grow">
        <span>Timezone <span class="muted">(for group schedules)</span></span>
        <TimezoneSelect value={tz} placeholder="Server timezone" onChange={(next) => { setTz(next); if (next !== (group.timezone ?? "")) patch({ timezone: next || null }); }} />
      </label>
      <div class="row wrap group-actions" style={{ gap: "6px" }}>
        <button class="ghost" disabled={group.deviceCount === 0} title="Refresh every live screen in this group" onClick={() => command("reload")}><Icon.convert /> Reload</button>
        <button class="ghost" disabled={group.deviceCount === 0} title="Flash a marker on every live screen" onClick={() => command("identify", { label: group.name })}><Icon.warning /> Identify</button>
        <a class="btn ghost-link" href={`/api/groups/${group.id}/play-log?days=30&format=csv`} download title="Download the last 30 days of proof-of-play"><Icon.download /> Play-log</a>
      </div>
    </div>
  );
}
