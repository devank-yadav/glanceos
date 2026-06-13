import { useEffect, useRef, useState } from "preact/hooks";
import { api, type HubItem } from "../api";
import { Thumb } from "../thumb";

export function HubPage() {
  const [items, setItems] = useState<HubItem[] | null>(null);
  const [q, setQ] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const timer = useRef<number | undefined>(undefined);

  const search = async (query: string) => {
    try {
      setItems(await api.get<HubItem[]>(`/api/hub?q=${encodeURIComponent(query)}`));
      setError("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  useEffect(() => {
    search("");
  }, []);

  const onSearch = (value: string) => {
    setQ(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => search(value), 300);
  };

  const importItem = async (item: HubItem) => {
    setMessage("");
    try {
      await api.post(`/api/hub/${item.id}/import`);
      setMessage(`Imported "${item.name}" — it's in your Setups now.`);
      await search(q); // refresh import counts
    } catch (e) {
      setMessage(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <>
      <h2>Template hub</h2>
      <p class="muted">
        Boards shared by everyone on this server. Import one to get your own editable copy —
        publish your own from the <a href="#/setups">Setups</a> page.
      </p>
      <div class="row">
        <label class="field grow">
          <span>Search</span>
          <input
            placeholder="clinic, desk, welcome…"
            value={q}
            onInput={(e) => onSearch((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
      </div>
      {message && <p class="ok">{message}</p>}
      {error && <p class="issues">{error}</p>}
      {items === null ? (
        <p class="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p class="muted">Nothing matches.</p>
      ) : (
        <div class="cards hub-cards">
          {items.map((item) => (
            <div key={item.id} class="card hub-card">
              <Thumb doc={item.document} />
              <div class="row spread">
                <strong>{item.name}</strong>
                <span class="muted">{item.importCount > 0 ? `${item.importCount}×` : ""}</span>
              </div>
              <p class="muted hub-byline">
                by {item.author}
                {item.description ? ` — ${item.description}` : ""}
              </p>
              <button class="primary" onClick={() => importItem(item)}>
                Import
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
