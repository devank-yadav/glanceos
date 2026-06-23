import type { BlockSourceT, WidgetT } from "@glanceos/schema";
import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { LIST_BLOCKS, PASSTHROUGH_BLOCKS, SERIES_BLOCKS } from "./blocks";
import { arrayPaths, atPath, itemKeys, scalarPaths } from "./inspectShape";
import { compileNotionFilter, NOTION_OPERATORS, type NotionFilterRow, type NotionFilterType } from "./notionFilter";

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
const TRANSFORMS = ["first", "last", "sum", "count", "percent", "join", "round", "currency", "duration", "rangeToWords", "none"];
// Human labels for the transform picker (raw enum tokens read as jargon).
const TRANSFORM_LABELS: Record<string, string> = {
  none: "None — use as-is", first: "First item", last: "Last item", sum: "Sum", count: "Count",
  percent: "As a number", join: "Join lines", round: "Round", currency: "Currency", duration: "Duration", rangeToWords: "Map to words",
};
// Transforms that take an argument, with the placeholder hint for the arg field.
const TRANSFORM_ARGS: Record<string, string> = {
  round: "decimals, e.g. 1",
  currency: "symbol, e.g. $",
  rangeToWords: "thresholds:labels, e.g. 33,67:Low,OK,High",
};

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
  const [transformArg, setTransformArg] = useState<string>(existing?.map?.transformArg ?? "");
  const [preview, setPreview] = useState("");
  const [previewData, setPreviewData] = useState<unknown>(undefined); // raw payload → shape inspector
  const [busy, setBusy] = useState(false);
  const [nf, setNf] = useState<NotionFilterRow[]>([]);
  const [nfComb, setNfComb] = useState<"and" | "or">("and");

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
    // Notion filter builder → query.body (a raw `body=` in params always wins).
    if (kind === "notion.database" && !query.body) {
      const compiled = compileNotionFilter(nf, nfComb);
      if (compiled.filter) query.body = JSON.stringify(compiled);
    }
    const map = !shaped
      ? { path: "", transform: "none" as const }
      : isSeries
        ? { path: "", items: items || undefined, fields: field ? { value: field } : undefined, transform: "series" as const }
        : isList
          ? { path: "", items: items || undefined, fields: field ? { text: field } : undefined, transform: "join" as const }
          : { path: field, items: items || undefined, transform: transform as BlockSourceT["map"]["transform"], transformArg: (transform in TRANSFORM_ARGS && transformArg) ? transformArg : undefined };
    return { connectionId: connId || undefined, kind, query, map } as BlockSourceT;
  };

  const ready = usingConn ? !!kind : !!url;

  const test = async () => {
    setBusy(true);
    setPreview("");
    setPreviewData(undefined);
    try {
      const r = await api.post<{ data: unknown }>("/api/source/preview", { source: build() });
      setPreviewData(r.data);
      setPreview(r.data == null ? "— (no data / unreachable / needs auth)" : JSON.stringify(r.data, null, 2).slice(0, 3000));
    } catch (e) {
      setPreview(`error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // ---- shape inspector: turn the previewed payload into clickable path suggestions ----
  const arrSugg = previewData != null ? arrayPaths(previewData).slice(0, 8) : [];
  const fieldSugg = (isSeries || isList)
    ? itemKeys(atPath(previewData, items) ?? (arrSugg[0] ? atPath(previewData, arrSugg[0].path) : previewData))
    : previewData != null ? scalarPaths(previewData).slice(0, 16) : [];

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
          {kind === "notion.database" && (
            <div class="notion-filter">
              <div class="row spread">
                <span class="field-label">Filter <span class="muted">(optional)</span></span>
                {nf.length > 1 && (
                  <select class="nf-comb" value={nfComb} onChange={(e) => setNfComb((e.currentTarget as HTMLSelectElement).value as "and" | "or")}>
                    <option value="and">match all</option>
                    <option value="or">match any</option>
                  </select>
                )}
              </div>
              {nf.map((r, i) => {
                const set = (patch: Partial<NotionFilterRow>) => setNf((rows) => rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div class="nf-row" key={i}>
                    <input class="nf-prop" value={r.property} placeholder="Property" onInput={(e) => set({ property: (e.currentTarget as HTMLInputElement).value })} />
                    <select value={r.type} onChange={(e) => { const type = (e.currentTarget as HTMLSelectElement).value as NotionFilterType; set({ type, operator: NOTION_OPERATORS[type][0] }); }}>
                      {Object.keys(NOTION_OPERATORS).map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select value={r.operator} onChange={(e) => set({ operator: (e.currentTarget as HTMLSelectElement).value })}>
                      {NOTION_OPERATORS[r.type].map((op) => <option key={op} value={op}>{op.replace(/_/g, " ")}</option>)}
                    </select>
                    {r.type !== "checkbox"
                      ? <input class="nf-val" value={r.value} placeholder="value" onInput={(e) => set({ value: (e.currentTarget as HTMLInputElement).value })} />
                      : <select value={r.value || "true"} onChange={(e) => set({ value: (e.currentTarget as HTMLSelectElement).value })}><option value="true">true</option><option value="false">false</option></select>}
                    <button class="ghost nf-del" title="Remove" onClick={() => setNf((rows) => rows.filter((_, j) => j !== i))}>×</button>
                  </div>
                );
              })}
              <button class="ghost nf-add" onClick={() => setNf((rows) => [...rows, { property: "", type: "title", operator: "contains", value: "" }])}>+ Add filter</button>
            </div>
          )}
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
            <span class="field-hint">{isSeries || isList ? "Dotted path to the list, e.g. results — blank uses the whole response." : "Dotted path to one value, e.g. main.temp — blank uses the whole response."}</span>
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
              <select value={transform} onChange={(e) => { setTransform((e.currentTarget as HTMLSelectElement).value); setTransformArg(""); }}>
                {TRANSFORMS.map((t) => <option key={t} value={t}>{TRANSFORM_LABELS[t] ?? t}</option>)}
              </select>
            </label>
          )}
          {!isSeries && !isList && transform in TRANSFORM_ARGS && (
            <label class="field">
              <span>Format</span>
              <input value={transformArg} placeholder={TRANSFORM_ARGS[transform]} onInput={(e) => setTransformArg((e.currentTarget as HTMLInputElement).value)} />
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
      {previewData != null && shaped && (arrSugg.length > 0 || fieldSugg.length > 0) && (
        <div class="data-inspect">
          <span class="muted data-inspect-hint">Click a path to fill the mapping:</span>
          {(isSeries || isList) && arrSugg.length > 0 && (
            <div class="di-row">
              <span class="di-label">List</span>
              {arrSugg.map((a) => (
                <button key={a.path || "root"} class="di-chip" title={`${a.n} rows`} onClick={() => setItems(a.path)}>{a.path || "(root)"} · {a.n}</button>
              ))}
            </div>
          )}
          {fieldSugg.length > 0 && (
            <div class="di-row">
              <span class="di-label">{isSeries || isList ? "Field" : "Value"}</span>
              {fieldSugg.map((f) => (
                <button key={f} class="di-chip" onClick={() => setField(f)}>{f}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {preview && <pre class="data-preview">{preview}</pre>}
    </div>
  );
}
