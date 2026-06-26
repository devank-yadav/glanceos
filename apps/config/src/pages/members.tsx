import { useEffect, useState } from "preact/hooks";
import { api, type AuthStatus, type OrgInvite, type OrgMember, type OrgRole, canManageTeam } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { Icon } from "../editor/icons";

// Team & members: the org's people. Owners/admins invite by email, change roles, and
// remove members; everyone can see the roster and leave. A personal workspace shows a
// "create a team" prompt instead. Invites are links (emailed in P3; copyable now).

const ROLE_LABEL: Record<OrgRole, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };
const ASSIGNABLE: OrgRole[] = ["viewer", "editor", "admin", "owner"];

// Full-screen invite-acceptance landing (route #/invite/:token). The user is already
// authenticated by the time this renders (app.tsx bounces a logged-out visitor through
// login, preserving the hash). The token is the bearer secret.
export function AcceptInvite({ token }: { token: string }) {
  const [preview, setPreview] = useState<{ org: { id: string; name: string }; role: OrgRole; invitedBy: string | null } | null | "invalid">(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.get<{ org: { id: string; name: string }; role: OrgRole; invitedBy: string | null }>(`/api/invites/${token}`)
      .then(setPreview).catch(() => setPreview("invalid"));
  }, [token]);

  async function accept() {
    setBusy(true);
    try { await api.post(`/api/invites/${token}/accept`); location.hash = "#/boards"; location.reload(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); setBusy(false); }
  }

  return (
    <div class="invite-screen">
      <div class="card invite-card">
        {preview === null && <p class="muted">Loading invite…</p>}
        {preview === "invalid" && (
          <>
            <h1 class="invite-title">Invite unavailable</h1>
            <p class="muted">This invite link is invalid or has expired. Ask whoever invited you for a fresh one.</p>
            <button class="ghost" onClick={() => { location.hash = "#/boards"; }}>Go to my workspace</button>
          </>
        )}
        {preview && preview !== "invalid" && (
          <>
            <h1 class="invite-title">Join {preview.org.name}</h1>
            <p class="muted">
              {preview.invitedBy ? `${preview.invitedBy} invited you` : "You've been invited"} to join <strong>{preview.org.name}</strong> as a <strong>{ROLE_LABEL[preview.role]}</strong>.
            </p>
            <div class="invite-actions">
              <button class="primary" disabled={busy} onClick={accept}>{busy ? "Joining…" : "Accept & join"}</button>
              <button class="ghost" disabled={busy} onClick={() => { location.hash = "#/boards"; }}>Not now</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function MembersPage() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("editor");
  const [teamName, setTeamName] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  const org = status?.activeOrg ?? null;
  const myRole = status?.role ?? null;
  const manage = canManageTeam(myRole) && !org?.personal;

  async function refresh() {
    setLoading(true);
    try {
      const s = await api.get<AuthStatus>("/api/auth/status");
      setStatus(s);
      if (s.activeOrg) {
        const body = await api.get<{ members: OrgMember[]; invites: OrgInvite[] }>(`/api/orgs/${s.activeOrg.id}/members`);
        setMembers(body.members);
        setInvites(body.invites);
      }
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, []);

  async function createTeam(e: Event) {
    e.preventDefault();
    if (!teamName.trim()) return;
    try { await api.post("/api/orgs", { name: teamName.trim() }); location.reload(); }
    catch (err) { toast.error(String(err instanceof Error ? err.message : err)); }
  }

  async function invite(e: Event) {
    e.preventDefault();
    if (!org || !email.includes("@")) return;
    try {
      const r = await api.post<{ token: string; link: string }>(`/api/orgs/${org.id}/invites`, { email: email.trim(), role: inviteRole });
      setEmail("");
      try { await navigator.clipboard.writeText(r.link); toast.success("Invite created — link copied"); }
      catch { toast.success("Invite created"); }
      await refresh();
    } catch (err) { toast.error(String(err instanceof Error ? err.message : err)); }
  }

  async function changeRole(m: OrgMember, role: OrgRole) {
    if (!org || role === m.role) return;
    try { await api.patch(`/api/orgs/${org.id}/members/${m.userId}`, { role }); toast.success(`${m.name} is now ${ROLE_LABEL[role]}`); await refresh(); }
    catch (err) { toast.error(String(err instanceof Error ? err.message : err)); }
  }

  async function remove(m: OrgMember) {
    if (!org) return;
    const self = m.userId === status?.user?.id;
    if (!(await confirm({ title: self ? "Leave this team?" : `Remove ${m.name}?`, confirmLabel: self ? "Leave" : "Remove", danger: true }))) return;
    try {
      await api.del(`/api/orgs/${org.id}/members/${m.userId}`);
      if (self) location.reload(); else { toast.success(`${m.name} removed`); await refresh(); }
    } catch (err) { toast.error(String(err instanceof Error ? err.message : err)); }
  }

  async function revoke(token: string) {
    if (!org) return;
    try { await api.del(`/api/orgs/${org.id}/invites/${token}`); toast.success("Invite revoked"); await refresh(); }
    catch (err) { toast.error(String(err instanceof Error ? err.message : err)); }
  }

  async function copyLink(token: string) {
    try { await navigator.clipboard.writeText(`${location.origin}/#/invite/${token}`); toast.success("Link copied"); }
    catch { toast.error("Couldn't copy"); }
  }

  if (loading && !status) return <div class="page"><PageHeader title="Team" /><p class="muted">Loading…</p></div>;

  // Personal workspace → invite them to start a team.
  if (org?.personal) {
    return (
      <div class="page">
        <PageHeader title="Team" />
        <EmptyState icon={<Icon.settings />} title="You're in your personal workspace" body="Create a team to invite people and share boards and screens." />
        <form class="card team-create" onSubmit={createTeam}>
          <label class="field">
            <span class="field-label">Team name</span>
            <input type="text" value={teamName} onInput={(e) => setTeamName((e.target as HTMLInputElement).value)} placeholder="Acme Inc" />
          </label>
          <button class="primary" type="submit" disabled={!teamName.trim()}>Create team</button>
        </form>
      </div>
    );
  }

  return (
    <div class="page">
      <PageHeader title={org ? `${org.name} · Team` : "Team"} />

      {manage && (
        <form class="card invite-row" onSubmit={invite}>
          <label class="field invite-email">
            <span class="field-label">Invite by email</span>
            <input type="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} placeholder="teammate@company.com" />
          </label>
          <label class="field invite-role">
            <span class="field-label">Role</span>
            <select value={inviteRole} onChange={(e) => setInviteRole((e.target as HTMLSelectElement).value as OrgRole)}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button class="primary" type="submit" disabled={!email.includes("@")}>Send invite</button>
        </form>
      )}

      <div class="card">
        <h2 class="card-title">Members</h2>
        <ul class="member-list">
          {members.map((m) => {
            const self = m.userId === status?.user?.id;
            return (
              <li key={m.userId} class="member-row">
                <span class="avatar" aria-hidden="true">{(m.name || "?").slice(0, 1).toUpperCase()}</span>
                <div class="member-id">
                  <span class="member-name">{m.name}{self && <span class="muted"> (you)</span>}</span>
                  <span class="member-email muted">{m.email}</span>
                </div>
                {manage ? (
                  <select class="member-role" value={m.role} onChange={(e) => changeRole(m, (e.target as HTMLSelectElement).value as OrgRole)}>
                    {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                ) : (
                  <span class="member-role-static muted">{ROLE_LABEL[m.role]}</span>
                )}
                {(manage || self) && (
                  <button class="ghost sm danger" title={self ? "Leave team" : "Remove"} onClick={() => remove(m)}><Icon.trash /></button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {manage && invites.length > 0 && (
        <div class="card">
          <h2 class="card-title">Pending invites</h2>
          <ul class="member-list">
            {invites.map((i) => (
              <li key={i.token} class="member-row">
                <span class="avatar invite-avatar" aria-hidden="true"><Icon.link /></span>
                <div class="member-id">
                  <span class="member-name">{i.email}</span>
                  <span class="member-email muted">Invited as {ROLE_LABEL[i.role]}</span>
                </div>
                <button class="ghost sm" onClick={() => copyLink(i.token)}>Copy link</button>
                <button class="ghost sm danger" title="Revoke" onClick={() => revoke(i.token)}><Icon.x /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
