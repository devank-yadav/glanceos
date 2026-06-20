import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

// Share a board (or screen) with another account on this install as viewer or
// editor. Invite by the grantee's account email; manage/revoke current grantees.

interface ShareRow { id: string; kind: "layout" | "device"; target_id: string; access: "viewer" | "editor"; granteeName: string }

export function ShareDialog({
  kind,
  targetId,
  targetName,
  onClose,
}: {
  kind: "layout" | "device";
  targetId: string;
  targetName: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ShareRow[]>([]);
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<"viewer" | "editor">("viewer");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = () =>
    api.get<ShareRow[]>("/api/shares")
      .then((all) => setRows(all.filter((s) => s.kind === kind && s.target_id === targetId)))
      .catch(() => {});
  useEffect(() => { load(); }, []);

  const invite = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/shares", { kind, targetId, email: email.trim(), access });
      setEmail("");
      toast.success("Shared");
      await load();
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  };
  const revoke = async (id: string) => { await api.del(`/api/shares/${id}`).catch(() => {}); await load(); };
  const setRowAccess = async (id: string, a: "viewer" | "editor") => { await api.patch(`/api/shares/${id}`, { access: a }).catch(() => {}); await load(); };

  return (
    <Modal open onClose={onClose} title={`Share — ${targetName}`}>
      <p class="muted" style={{ marginTop: 0 }}>Invite another GlanceOS account on this server. <strong>Viewer</strong> can open it; <strong>editor</strong> can change it.</p>
      <div class="row share-invite">
        <label class="field grow"><span>Account email</span>
          <input type="email" value={email} placeholder="person@example.com" onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && invite()} />
        </label>
        <label class="field"><span>Access</span>
          <select value={access} onChange={(e) => setAccess((e.currentTarget as HTMLSelectElement).value as "viewer" | "editor")}>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
        </label>
        <button class="primary" disabled={busy || !email.trim()} onClick={invite}>Share</button>
      </div>
      {rows.length > 0 && (
        <ul class="picker-list share-grantees">
          {rows.map((s) => (
            <li key={s.id} class="row spread">
              <span><strong>{s.granteeName}</strong></span>
              <span class="row" style={{ gap: "6px" }}>
                <select value={s.access} onChange={(e) => setRowAccess(s.id, (e.currentTarget as HTMLSelectElement).value as "viewer" | "editor")}>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button class="ghost danger" onClick={() => revoke(s.id)}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
