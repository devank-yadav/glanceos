import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { Icon } from "../editor/icons";

// Inbound webhook "inlets": an external service POSTs to a secret URL and the
// payload is routed to a task list / queue / custom-data key. Management is
// session-only; the public endpoint is /api/hooks/:secret.

type SinkKind = "task" | "queue" | "data" | "values" | "none";
interface Inlet { id: string; name: string; secret: string; sinkKind: SinkKind; sinkTarget: string; enabled: boolean; signed: boolean; createdAt: number; lastFired: number | null }
interface Created { inlet: Inlet; url: string; signingKey?: string; example: unknown }

const SINKS: { id: SinkKind; label: string; target: string }[] = [
  { id: "task", label: "Add a task", target: "Task list id (default)" },
  { id: "queue", label: "Advance a queue", target: "Queue id" },
  { id: "data", label: "Write one data value", target: "Data key" },
  // #30 — the whole POSTed JSON object lands as data values: {"temp": 21, "door": "open"}
  { id: "values", label: "Write many data values (JSON object)", target: "" },
  { id: "none", label: "Nothing (automations only)", target: "" },
];

export function InletsPage() {
  const [items, setItems] = useState<Inlet[] | null>(null);
  const [name, setName] = useState("");
  const [sinkKind, setSinkKind] = useState<SinkKind>("task");
  const [sinkTarget, setSinkTarget] = useState("default");
  const [requireSignature, setRequireSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<Created | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = () => api.get<Inlet[]>("/api/inlets").then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const origin = location.origin;
  const urlFor = (secret: string) => `${origin}/api/hooks/${secret}`;
  const copy = (s: string) => navigator.clipboard?.writeText(s).then(() => toast.success("Copied"), () => {});

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<Created>("/api/inlets", { name: name.trim(), sinkKind, sinkTarget, requireSignature });
      setFresh(res);
      setName("");
      await load();
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  };
  const toggle = async (it: Inlet) => { await api.patch(`/api/inlets/${it.id}`, { enabled: !it.enabled }).catch(() => {}); await load(); };
  const remove = async (it: Inlet) => {
    if (!(await confirm({ title: `Delete "${it.name}"?`, body: "The webhook URL stops working immediately.", confirmLabel: "Delete", danger: true }))) return;
    await api.del(`/api/inlets/${it.id}`).catch(() => {});
    await load();
  };

  return (
    <>
      <PageHeader title="Data inlets" />
      <div class="shell-content">
        <p class="muted page-intro">Give an external service a secret URL to POST to. Each call routes its JSON payload to a task list, a queue, or a custom-data key — so a webhook can update what's on your screens.</p>

        <section class="card account-section">
          <h2>New inlet</h2>
          <div class="key-mint">
            <label class="field grow"><span>Name</span>
              <input value={name} placeholder="e.g. Deploy notifier" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
            </label>
            <div class="row wrap" style={{ gap: "10px" }}>
              <label class="field"><span>On call, do</span>
                <select value={sinkKind} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value as SinkKind; setSinkKind(v); setSinkTarget(v === "task" ? "default" : ""); }}>
                  {SINKS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              {sinkKind !== "none" && sinkKind !== "values" && (
                <label class="field grow"><span>{SINKS.find((s) => s.id === sinkKind)!.target}</span>
                  <input value={sinkTarget} onInput={(e) => setSinkTarget((e.currentTarget as HTMLInputElement).value)} />
                </label>
              )}
              {sinkKind === "values" && (
                <p class="muted" style={{ alignSelf: "center", margin: 0 }}>POST a JSON object — every key becomes a data value (first 32).</p>
              )}
            </div>
            <label class="scope-opt"><input type="checkbox" checked={requireSignature} onChange={(e) => setRequireSignature((e.currentTarget as HTMLInputElement).checked)} /> <span>Require a signed body (HMAC-SHA256)</span></label>
            <button class="primary" disabled={busy || !name.trim()} onClick={create}>Create inlet</button>
          </div>

          {fresh && (
            <div class="callout token-reveal">
              <strong>Your inlet is ready. POST JSON to this URL:</strong>
              <div class="row token-row"><code class="token-value">{fresh.url}</code><button class="ghost" onClick={() => copy(fresh.url)}>Copy</button></div>
              {fresh.signingKey && (
                <>
                  <strong>Signing key — shown once. Send <code>x-signature: sha256(hmac)</code>.</strong>
                  <div class="row token-row"><code class="token-value">{fresh.signingKey}</code><button class="ghost" onClick={() => copy(fresh.signingKey!)}>Copy</button></div>
                </>
              )}
              <div class="row"><button class="ghost" onClick={() => setFresh(null)}>Done</button></div>
            </div>
          )}
        </section>

        {items === null ? (
          <div class="cards">{[0, 1].map((i) => <div key={i} class="skeleton skeleton-card" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Icon.link />} title="No inlets yet" body="Create one above to start receiving webhooks." />
        ) : (
          <ul class="picker-list key-list">
            {items.map((it) => (
              <li key={it.id} class="row spread">
                <span class="key-meta">
                  <strong>{it.name}</strong> {!it.enabled && <span class="chip subtle">disabled</span>} {it.signed && <span class="chip">signed</span>}
                  <span class="muted">→ {it.sinkKind}{it.sinkTarget ? ` (${it.sinkTarget})` : ""}</span>
                  <code class="key-scopes" title={urlFor(it.secret)}>{urlFor(it.secret).slice(0, 48)}…</code>
                  <span class="muted">{it.lastFired ? `last fired ${new Date(it.lastFired).toLocaleString()}` : "never fired"}</span>
                </span>
                <span class="row" style={{ gap: "6px" }}>
                  <button class="ghost" onClick={() => copy(urlFor(it.secret))}>Copy URL</button>
                  <button class="ghost" onClick={() => toggle(it)}>{it.enabled ? "Disable" : "Enable"}</button>
                  <button class="ghost danger" onClick={() => remove(it)}>Delete</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
