import type { BlockSourceT, WidgetT } from "@glanceos/schema";
import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { LIST_BLOCKS, PASSTHROUGH_BLOCKS, SERIES_BLOCKS } from "./blocks";

// The ⟿ Data tab: point a block at a live source. Two ways in:
//  • a saved connection (Todoist, GitHub, Notion, … — set up on the Integrations
//    page; the server holds the token), pick one of its resources; or
//  • a public/secret URL (REST/JSON, a Google Sheet CSV, an iCal calendar, RSS).
// Then map the response onto the block (a chart's series, a stat's value, a
// list's lines) with a live Test preview.

interface ProviderInfo { id: string; label: string; authKind: string; resources: { id: string; label: string; shape: string }[] }
interface Connection { id: string; provider: string; label: string }

const URL_KINDS = [
  { id: "rest", label: "REST / JSON URL" },
  { id: "sheets.csv", label: "Google Sheet (published CSV)" },
  { id: "graphql", label: "GraphQL" },
  { id: "ical.events", label: "Calendar (iCal URL)" },
  { id: "rss.feed", label: "RSS / Atom feed" },
];
const TRANSFORMS = ["first", "last", "sum", "count", "percent", "join", "none"];

const parseParams = (s: string): Record<string, string> =>
  Object.fromEntries(
    s.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf("=");
      return i < 0 ? [l, ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
  );

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
  const isList = LIST_BLOCKS.has(block.type);
  const isPass = PASSTHROUGH_BLOCKS.has(block.type);
  const existing = block.source;

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [conns, setConns] = useState<Connection[]>([]);
  const [connId, setConnId] = useState(existing?.connectionId ?? "");
  const [urlKind, setUrlKind] = useState(existing && !existing.connectionId ? existing.kind : block.type === "calendar" ? "ical.events" : block.type === "headlines" ? "rss.feed" : "rest");
  const [resource, setResource] = useState(existing?.connectionId ? existing.kind : "");
  const [url, setUrl] = useState(existing?.query?.url ?? "");
  const [gql, setGql] = useState(existing?.query?.gqlQuery ?? "");
  const [params, setParams] = useState(
    existing?.connectionId ? Object.entries(existing.query ?? {}).map(([k, v]) => `${k}=${v}`).join("\n") : "",
  );
  const [items, setItems] = useState(existing?.map?.items ?? "");
  const [field, setField] = useState(existing?.map?.fields?.value ?? existing?.map?.fields?.text ?? existing?.map?.path ?? "");
  const [transform, setTransform] = useState<string>(existing?.map?.transform ?? "first");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.get<ProviderInfo[]>("/api/providers"), api.get<Connection[]>("/api/connections")])
      .then(([p, c]) => { setProviders(p); setConns(c); })
      .catch(() => {});
  }, []);

  const usingConn = !!connId;
  const conn = conns.find((c) => c.id === connId);
  const resources = conn ? providers.find((p) => p.id === conn.provider)?.resources ?? [] : [];
  const kind = usingConn ? (resource || resources[0]?.id || "") : urlKind;
  const passthrough = isPass || kind === "ical.events" || kind === "rss.feed";
  const shaped = !passthrough;

  const build = (): BlockSourceT => {
    const query: Record<string, string> = usingConn ? parseParams(params) : { url };
    if (!usingConn && urlKind === "graphql") query.gqlQuery = gql;
    const map = !shaped
      ? { path: "", transform: "none" as const }
      : isSeries
        ? { path: "", items: items || undefined, fields: field ? { value: field } : undefined, transform: "series" as const }
        : isList
          ? { path: "", items: items || undefined, fields: field ? { text: field } : undefined, transform: "join" as const }
          : { path: field, items: items || undefined, transform: transform as BlockSourceT["map"]["transform"] };
    return { connectionId: connId || undefined, kind, query, map } as BlockSourceT;
  };

  const ready = usingConn ? !!kind : !!url;

  const test = async () => {
    setBusy(true);
    setPreview("");
    try {
      const r = await api.post<{ data: unknown }>("/api/source/preview", { source: build() });
      setPreview(r.data == null ? "— (no data / unreachable / needs auth)" : JSON.stringify(r.data).slice(0, 260));
    } catch (e) {
      setPreview(`error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="data-panel">
      <h3>⟿ Data source</h3>
      <label class="field grow">
        <span>Connection</span>
        <select value={connId} onChange={(e) => { setConnId((e.currentTarget as HTMLSelectElement).value); setResource(""); }}>
          <option value="">Public / secret URL</option>
          {conns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      {conns.length === 0 && !usingConn && <p class="muted data-hint">Tip: connect apps (Todoist, GitHub, Notion…) on the Integrations page, then pick them here.</p>}

      {usingConn ? (
        <>
          <label class="field grow">
            <span>Resource</span>
            <select value={kind} onChange={(e) => setResource((e.currentTarget as HTMLSelectElement).value)}>
              {resources.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <label class="field grow">
            <span>Parameters</span>
            <textarea value={params} placeholder={"repo=owner/name\ndatabase_id=…\nproject_id=…"} onInput={(e) => setParams((e.currentTarget as HTMLTextAreaElement).value)} />
          </label>
        </>
      ) : (
        <>
          <label class="field grow">
            <span>Source type</span>
            <select value={urlKind} onChange={(e) => setUrlKind((e.currentTarget as HTMLSelectElement).value)}>
              {URL_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
          <label class="field grow">
            <span>URL</span>
            <input value={url} placeholder="https://…" onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)} />
          </label>
          {urlKind === "graphql" && (
            <label class="field grow">
              <span>GraphQL query</span>
              <textarea value={gql} onInput={(e) => setGql((e.currentTarget as HTMLTextAreaElement).value)} />
            </label>
          )}
        </>
      )}

      {shaped && (
        <>
          <label class="field grow">
            <span>{isSeries || isList ? "Array path (items)" : "Field path"}</span>
            <input value={isSeries || isList ? items : field} placeholder={isSeries || isList ? "results (blank = root)" : "data.total"} onInput={(e) => ((isSeries || isList) ? setItems : setField)((e.currentTarget as HTMLInputElement).value)} />
          </label>
          {(isSeries || isList) && (
            <label class="field grow">
              <span>{isSeries ? "Value field (per item)" : "Text field (per item)"}</span>
              <input value={field} placeholder={isSeries ? "count" : "content / title"} onInput={(e) => setField((e.currentTarget as HTMLInputElement).value)} />
            </label>
          )}
          {!isSeries && !isList && (
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
        <button class="ghost" disabled={busy || !ready} onClick={test}>{busy ? "Testing…" : "Test"}</button>
        <div class="row">
          {existing && <button class="ghost" onClick={() => { setSource(undefined); onClose(); }}>Unbind</button>}
          <button disabled={!ready} onClick={() => { setSource(build()); onClose(); }}>Bind</button>
        </div>
      </div>
      {preview && <pre class="data-preview">{preview}</pre>}
    </div>
  );
}
