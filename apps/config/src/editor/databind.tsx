import type { BlockSourceT, WidgetT } from "@glanceos/schema";
import { useState } from "preact/hooks";
import { api } from "../api";
import { PASSTHROUGH_BLOCKS, SERIES_BLOCKS } from "./blocks";

// The ⟿ Data tab: point a block at a live source instead of typed-in props.
// v1 covers public/secret URLs (no saved account needed) — REST/JSON, a Google
// Sheet's published CSV, an iCal calendar URL, RSS, or GraphQL. Saved-account
// connections (Todoist, GitHub, …) plug into the same panel next.

interface Kind { id: string; label: string; passthrough: boolean; hint: string }
const KINDS: Kind[] = [
  { id: "rest", label: "REST / JSON URL", passthrough: false, hint: "Any URL that returns JSON" },
  { id: "sheets.csv", label: "Google Sheet (published CSV)", passthrough: false, hint: "File → Share → Publish to web → CSV" },
  { id: "graphql", label: "GraphQL", passthrough: false, hint: "A GraphQL endpoint + query" },
  { id: "ical.events", label: "Calendar (iCal URL)", passthrough: true, hint: "Google/Apple/Outlook secret .ics URL" },
  { id: "rss.feed", label: "RSS / Atom feed", passthrough: true, hint: "Any feed URL" },
];

const TRANSFORMS = ["series", "first", "last", "sum", "count", "percent", "join", "none"];

export function DataPanel({
  block,
  setSource,
  onClose,
}: {
  block: WidgetT;
  setSource: (src: BlockSourceT | undefined) => void;
  onClose: () => void;
}) {
  const isSeries = SERIES_BLOCKS.has(block.type);
  const isPass = PASSTHROUGH_BLOCKS.has(block.type);
  const existing = block.source;
  const [kind, setKind] = useState(existing?.kind ?? (block.type === "calendar" ? "ical.events" : block.type === "headlines" ? "rss.feed" : "rest"));
  const [url, setUrl] = useState(existing?.query?.url ?? "");
  const [items, setItems] = useState(existing?.map?.items ?? (isSeries ? "" : ""));
  const [valueField, setValueField] = useState(existing?.map?.fields?.value ?? existing?.map?.path ?? "");
  const [gql, setGql] = useState(existing?.query?.gqlQuery ?? "");
  const [transform, setTransform] = useState<string>(existing?.map?.transform ?? (isSeries ? "series" : isPass ? "none" : "first"));
  const [preview, setPreview] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const kindMeta = KINDS.find((k) => k.id === kind) ?? KINDS[0]!;
  const shaped = !kindMeta.passthrough && !isPass;

  const build = (): BlockSourceT => {
    const query: Record<string, string> = { url };
    if (kind === "graphql") query.gqlQuery = gql;
    const map = !shaped
      ? { path: "", transform: "none" as const }
      : isSeries
        ? { path: "", items: items || undefined, fields: valueField ? { value: valueField } : undefined, transform: "series" as const }
        : { path: valueField, items: items || undefined, transform: transform as BlockSourceT["map"]["transform"] };
    return { kind, query, map } as BlockSourceT;
  };

  const test = async () => {
    setBusy(true);
    setPreview("");
    try {
      const r = await api.post<{ data: unknown }>("/api/source/preview", { source: build() });
      setPreview(r.data == null ? "— (no data / unreachable)" : JSON.stringify(r.data).slice(0, 240));
    } catch (e) {
      setPreview(`error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const apply = () => { setSource(build()); onClose(); };
  const unbind = () => { setSource(undefined); onClose(); };

  return (
    <div class="data-panel">
      <h3>⟿ Data source</h3>
      <label class="field grow">
        <span>Source</span>
        <select value={kind} onChange={(e) => setKind((e.currentTarget as HTMLSelectElement).value)}>
          {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
      </label>
      <p class="muted data-hint">{kindMeta.hint}</p>
      <label class="field grow">
        <span>URL</span>
        <input value={url} placeholder="https://…" onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)} />
      </label>
      {kind === "graphql" && (
        <label class="field grow">
          <span>GraphQL query</span>
          <textarea value={gql} onInput={(e) => setGql((e.currentTarget as HTMLTextAreaElement).value)} />
        </label>
      )}
      {shaped && (
        <>
          <label class="field grow">
            <span>{isSeries ? "Array path (items)" : "Field path"}</span>
            <input value={isSeries ? items : valueField} placeholder={isSeries ? "results" : "data.total"} onInput={(e) => (isSeries ? setItems : setValueField)((e.currentTarget as HTMLInputElement).value)} />
          </label>
          {isSeries && (
            <label class="field grow">
              <span>Value field (per item)</span>
              <input value={valueField} placeholder="count" onInput={(e) => setValueField((e.currentTarget as HTMLInputElement).value)} />
            </label>
          )}
          {!isSeries && (
            <label class="field">
              <span>Transform</span>
              <select value={transform} onChange={(e) => setTransform((e.currentTarget as HTMLSelectElement).value)}>
                {TRANSFORMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          )}
        </>
      )}
      <div class="row spread data-actions">
        <button class="ghost" disabled={busy || !url} onClick={test}>{busy ? "Testing…" : "Test"}</button>
        <div class="row">
          {existing && <button class="ghost" onClick={unbind}>Unbind</button>}
          <button disabled={!url} onClick={apply}>Bind</button>
        </div>
      </div>
      {preview && <pre class="data-preview">{preview}</pre>}
    </div>
  );
}
