import { useEffect, useState } from "preact/hooks";
import { api, type LayoutRecord, type SetupSummary } from "../api";
import { navigate } from "../router";

export function SetupsPage() {
  const [setups, setSetups] = useState<SetupSummary[] | null>(null);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      setSetups(await api.get<SetupSummary[]>("/api/layouts"));
      setError("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  if (setups === null) return <p class="muted">Loading…</p>;

  return (
    <>
      <h2>Setups</h2>
      <p class="muted">
        A setup is a screen customization that lives independently of any screen — disconnect a
        screen and its setup survives; attach one setup to many screens and they stay in step.
      </p>
      {error && <p class="issues">{error}</p>}
      <div class="cards">
        {setups.map((s) => (
          <SetupCard key={s.id} setup={s} onChanged={refresh} />
        ))}
        <ImportCard onImported={refresh} />
      </div>
    </>
  );
}

function SetupCard({ setup, onChanged }: { setup: SetupSummary; onChanged: () => Promise<void> }) {
  const [description, setDescription] = useState(setup.description);
  const [busy, setBusy] = useState(false);

  const exportJson = async () => {
    const record = await api.get<LayoutRecord>(`/api/layouts/${setup.id}`);
    const blob = new Blob([JSON.stringify(record.document, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${setup.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.glanceos.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const togglePublish = async () => {
    setBusy(true);
    try {
      await api.patch(`/api/layouts/${setup.id}`, { published: !setup.published, description });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (setup.usedBy > 0 && !confirm(`"${setup.name}" is live on ${setup.usedBy} screen(s). They will fall back to "pick a setup". Delete anyway?`)) return;
    await api.del(`/api/layouts/${setup.id}`);
    await onChanged();
  };

  return (
    <div class="card">
      <div class="row spread">
        <strong>{setup.name}</strong>
        {setup.published && <span class="badge published">in hub</span>}
      </div>
      <p class="muted setup-line">
        {setup.widgetCount} blocks · {setup.rowCount} lines
        {setup.usedBy > 0 ? <> · live on <strong>{setup.deviceNames.join(", ")}</strong></> : " · not attached"}
        {setup.importCount > 0 && <> · imported {setup.importCount}×</>}
      </p>
      <div class="row wrap">
        <button class="primary" onClick={() => navigate(`/edit/${setup.id}`)}>Open studio</button>
        <button onClick={() => api.post(`/api/layouts/${setup.id}/duplicate`).then(onChanged)}>Duplicate</button>
        <button onClick={exportJson}>Export</button>
        <button class="danger" onClick={remove}>Delete</button>
      </div>
      <div class="row wrap publish-row">
        <label class="field grow">
          <span>Hub description</span>
          <input
            value={description}
            placeholder="What is this board for?"
            onInput={(e) => setDescription((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <button disabled={busy} onClick={togglePublish}>
          {setup.published ? "Unpublish" : "Publish to hub"}
        </button>
      </div>
    </div>
  );
}

function ImportCard({ onImported }: { onImported: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");

  const importJson = async (raw: string) => {
    setMessage("");
    try {
      // The server validates the document (and migrates old versions);
      // keeping zod out of this page keeps the first load tiny.
      const parsed = JSON.parse(raw) as { name?: string };
      await api.post("/api/layouts", { name: parsed?.name ?? "Imported setup", document: parsed });
      setText("");
      setMessage("Imported.");
      await onImported();
    } catch (e) {
      setMessage(e instanceof SyntaxError ? "That isn't valid JSON." : String(e instanceof Error ? e.message : e));
    }
  };

  const onFile = (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    file.text().then(importJson);
  };

  return (
    <div class="card import-card">
      <h3>Import a setup</h3>
      <p class="muted">Paste exported JSON, or pick a <code>.glanceos.json</code> file.</p>
      <textarea
        rows={4}
        placeholder='{"schemaVersion":1, …}'
        value={text}
        onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
      />
      <div class="row spread">
        <input type="file" accept=".json,application/json" onChange={onFile} />
        <button class="primary" disabled={!text.trim()} onClick={() => importJson(text)}>
          Import
        </button>
      </div>
      {message && <p class="muted">{message}</p>}
    </div>
  );
}
