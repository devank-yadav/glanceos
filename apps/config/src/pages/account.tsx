import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";

// Account management: rename, change password, log out everywhere, export a
// backup, and delete the account (cascades all data server-side).
export function AccountPage() {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [name, setName] = useState("");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [delPw, setDelPw] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    api.get<{ user: { name: string; email: string } | null }>("/api/auth/status")
      .then((s) => { if (s.user) { setUser(s.user); setName(s.user.name); } })
      .catch(() => {});
  }, []);

  const toLogin = () => { location.hash = "#/login"; location.reload(); };

  const saveName = async () => {
    try { await api.patch("/api/account", { name }); toast.success("Name updated"); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const savePassword = async () => {
    try {
      await api.post("/api/account/password", { current: cur, next });
      setCur(""); setNext(""); toast.success("Password changed");
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const logoutEverywhere = async () => {
    if (!(await confirm({ title: "Log out everywhere?", body: "Every signed-in session (including this one) will be ended.", confirmLabel: "Log out everywhere" }))) return;
    await api.post("/api/account/logout-everywhere").catch(() => {});
    toLogin();
  };
  const deleteAccount = async () => {
    if (!delPw) { toast.error("Enter your password to delete the account"); return; }
    if (!(await confirm({ title: "Delete your account?", body: "This permanently removes your boards, screens, playlists, connections and tasks. This cannot be undone.", confirmLabel: "Delete account", danger: true }))) return;
    try {
      await api.del("/api/account", { password: delPw });
      toLogin();
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  return (
    <>
      <PageHeader title="Account" />
      <div class="shell-content account-page">
        <section class="card account-section">
          <h2>Profile</h2>
          <label class="field grow"><span>Name</span><input value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} /></label>
          <label class="field grow"><span>Email</span><input value={user?.email ?? ""} disabled /></label>
          <div class="row"><button class="primary" onClick={saveName}>Save</button></div>
        </section>

        <section class="card account-section">
          <h2>Password</h2>
          <label class="field grow"><span>Current password</span><input type="password" autoComplete="current-password" value={cur} onInput={(e) => setCur((e.currentTarget as HTMLInputElement).value)} /></label>
          <label class="field grow"><span>New password <em>(min 8 characters)</em></span><input type="password" autoComplete="new-password" value={next} onInput={(e) => setNext((e.currentTarget as HTMLInputElement).value)} /></label>
          <div class="row"><button class="primary" disabled={!cur || next.length < 8} onClick={savePassword}>Change password</button></div>
        </section>

        <section class="card account-section">
          <h2>Sessions & data</h2>
          <div class="row wrap">
            <a class="ghost" href="/api/account/export">Download backup (.json)</a>
            <button class="ghost" onClick={logoutEverywhere}>Log out everywhere</button>
          </div>
        </section>

        <section class="card account-section danger-zone">
          <h2>Danger zone</h2>
          <p class="muted">Deleting your account removes all of your data and cannot be undone.</p>
          <label class="field grow"><span>Confirm with your password</span><input type="password" value={delPw} onInput={(e) => setDelPw((e.currentTarget as HTMLInputElement).value)} /></label>
          <div class="row"><button class="ghost danger" onClick={deleteAccount}>Delete account</button></div>
        </section>
      </div>
    </>
  );
}
