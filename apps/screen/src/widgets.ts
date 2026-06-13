import type {
  AirQualityDataT, CalendarDataT, CryptoDataT, CurrencyDataT, FactDataT, ForecastDataT,
  GithubDataT, HeadlinesDataT, HolidayDataT, IssDataT, OnThisDayDataT, PrecipDataT,
  QueueDataT, QuoteLiveDataT, TasksDataT, UvDataT, WeatherDataT, WidgetT, WikiDataT, WindDataT,
} from "@glanceos/schema";
import { isoWeek, moonPhase, sunTimes } from "./astro";
import { barSvg, nums, ringSvg, romanTime, seasonOf, sparkSvg, zodiacOf } from "./viz";

// The whole widget contract: take a cell, render into it, optionally return a
// cleanup. All user-supplied strings go through textContent — never markup.

type Cleanup = () => void;
type Render = (el: HTMLElement, widget: WidgetT, data: unknown) => Cleanup | void;

function div(className: string, text?: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = className;
  if (text !== undefined) d.textContent = text;
  return d;
}

const lines = (s: string): string[] => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const fmtTime = (d: Date, opts: Intl.DateTimeFormatOptions): string => {
  try {
    return d.toLocaleTimeString([], opts);
  } catch {
    return "—";
  }
};
const every = (ms: number, fn: () => void): Cleanup => {
  fn();
  const h = window.setInterval(fn, ms);
  return () => window.clearInterval(h);
};

// ---- data-binding bridge ----
// A bound block draws from the server-resolved data[id]; an unbound one uses its
// typed-in props (the offline fallback). These keep zod out of the runtime — the
// resolved value arrives as `unknown` and we coerce defensively.
const boundNums = (w: WidgetT, data: unknown): number[] =>
  Array.isArray(data)
    ? (data as unknown[]).map((x) => (typeof x === "number" ? x : Number((x as { value?: unknown })?.value ?? x) || 0))
    : nums((w.props as { values?: string }).values ?? "");
const boundStr = (w: WidgetT, data: unknown, prop: string): string => {
  if (data == null) return String((w.props as Record<string, unknown>)[prop] ?? "");
  if (typeof data === "object") return String((data as Record<string, unknown>)[prop] ?? (data as Record<string, unknown>).value ?? "");
  return String(data);
};
const boundNum = (w: WidgetT, data: unknown, prop: string): number => {
  const raw = data == null
    ? (w.props as Record<string, unknown>)[prop]
    : typeof data === "object"
      ? (data as Record<string, unknown>).value ?? (data as Record<string, unknown>)[prop]
      : data;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number((w.props as Record<string, unknown>)[prop]) || 0;
};

// ---------- existing ----------

const clock: Render = (el, widget) => {
  const props = widget.type === "clock" ? widget.props : { showDate: true };
  const time = div("clock-time");
  el.appendChild(time);
  let date: HTMLDivElement | undefined;
  if (props.showDate) {
    date = div("clock-date");
    el.appendChild(date);
  }
  return every(1000, () => {
    const now = new Date();
    time.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (date) date.textContent = now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  });
};

const weather: Render = (el, widget, data) => {
  const d = data as WeatherDataT | null;
  const label = widget.type === "weather" ? widget.props.label : undefined;
  if (label) el.appendChild(div("widget-heading", label));
  if (!d) {
    el.appendChild(div("placeholder", "weather unavailable"));
    return;
  }
  el.appendChild(div("weather-temp", `${Math.round(d.temperatureC)}°`));
  el.appendChild(div("weather-summary", d.summary));
  if (d.high !== undefined && d.low !== undefined) {
    el.appendChild(div("weather-range", `${Math.round(d.high)}° / ${Math.round(d.low)}°`));
  }
};

const calendar: Render = (el, _w, data) => {
  const d = data as CalendarDataT | undefined;
  el.appendChild(div("widget-heading", "Agenda"));
  if (!d || d.events.length === 0) {
    el.appendChild(div("placeholder", d?.error ?? "No upcoming events"));
    return;
  }
  for (const event of d.events) {
    const row = div("cal-event");
    const start = new Date(event.start);
    const when = event.allDay
      ? start.toLocaleDateString([], { weekday: "short" })
      : `${start.toLocaleDateString([], { weekday: "short" })} ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    row.appendChild(div("cal-time", when));
    row.appendChild(div("cal-title", event.title));
    el.appendChild(row);
  }
};

const tasks: Render = (el, _w, data) => {
  const d = data as TasksDataT | undefined;
  el.appendChild(div("widget-heading", "Tasks"));
  if (!d || d.items.length === 0) {
    el.appendChild(div("placeholder", "All clear"));
    return;
  }
  for (const item of d.items) el.appendChild(div("task", item.text));
};

const text: Render = (el, widget) => {
  if (widget.type !== "text") return;
  const node = div("text-content", widget.props.content);
  if (widget.props.align === "center") node.classList.add("center");
  el.appendChild(node);
};

const queue: Render = (el, _w, data) => {
  const d = data as QueueDataT | undefined;
  el.appendChild(div("queue-title", d?.title ?? "Now serving"));
  el.appendChild(div("queue-number", String(d?.nowServing ?? 0)));
  el.appendChild(div("queue-waiting", `${d?.waiting ?? 0} waiting`));
};

const heading: Render = (el, widget) => {
  if (widget.type !== "heading") return;
  el.appendChild(div(`heading heading-${widget.props.level}`, widget.props.content));
};

const divider: Render = (el) => {
  el.appendChild(div("divider-rule"));
};

const image: Render = (el, widget) => {
  if (widget.type !== "image") return;
  const img = document.createElement("img");
  img.alt = "";
  img.className = `image image-${widget.props.fit}`;
  img.onerror = () => {
    el.innerHTML = "";
    el.appendChild(div("placeholder", "image unavailable"));
  };
  img.src = widget.props.url;
  el.appendChild(img);
};

const callout: Render = (el, widget) => {
  if (widget.type !== "callout") return;
  const wrap = div("callout");
  wrap.appendChild(div("callout-emoji", widget.props.emoji));
  wrap.appendChild(div("callout-content", widget.props.content));
  el.appendChild(wrap);
};

// ---------- text & structure ----------

const subheading: Render = (el, w) => {
  if (w.type !== "subheading") return;
  el.appendChild(div("subheading", w.props.content));
};

const quote: Render = (el, w) => {
  if (w.type !== "quote") return;
  const wrap = div("quote");
  wrap.appendChild(div("quote-text", `“${w.props.content}”`));
  if (w.props.author) wrap.appendChild(div("quote-author", `— ${w.props.author}`));
  el.appendChild(wrap);
};

const listRender = (cls: string, marker: (i: number) => string): Render => (el, w) => {
  const items = "items" in w.props ? lines((w.props as { items: string }).items) : [];
  const list = div(cls);
  items.forEach((item, i) => {
    const row = div("li");
    row.appendChild(div("li-marker", marker(i)));
    row.appendChild(div("li-text", item));
    list.appendChild(row);
  });
  el.appendChild(list);
};

const bulletList = listRender("list", () => "•");
const numberedList = listRender("list", (i) => `${i + 1}.`);

const checklist: Render = (el, w) => {
  if (w.type !== "checklist") return;
  const list = div("list");
  for (const raw of lines(w.props.items)) {
    const done = /^(\[?x\]?|✓)\s+/i.test(raw);
    const label = raw.replace(/^(\[?x\]?|\[?\s?\]?|✓|-)\s+/i, "");
    const row = div("li");
    row.appendChild(div("li-marker", done ? "☑" : "☐"));
    const t = div("li-text", label);
    if (done) t.classList.add("li-done");
    row.appendChild(t);
    list.appendChild(row);
  }
  el.appendChild(list);
};

const code: Render = (el, w) => {
  if (w.type !== "code") return;
  const pre = document.createElement("pre");
  pre.className = "code-block";
  pre.textContent = w.props.content;
  el.appendChild(pre);
};

const label: Render = (el, w) => {
  if (w.type !== "label") return;
  el.appendChild(div("eyebrow", w.props.content));
};

const keyValue: Render = (el, w) => {
  if (w.type !== "keyValue") return;
  const list = div("kv");
  for (const ln of lines(w.props.pairs)) {
    const idx = ln.indexOf(":");
    const row = div("kv-row");
    row.appendChild(div("kv-key", idx === -1 ? ln : ln.slice(0, idx).trim()));
    row.appendChild(div("kv-val", idx === -1 ? "" : ln.slice(idx + 1).trim()));
    list.appendChild(row);
  }
  el.appendChild(list);
};

const table: Render = (el, w) => {
  if (w.type !== "table") return;
  const rows = lines(w.props.content).map((ln) => ln.split(/\s*[|,]\s*/));
  const tbl = document.createElement("table");
  tbl.className = "data-table";
  rows.forEach((cells, r) => {
    const tr = document.createElement("tr");
    cells.forEach((c) => {
      const cell = document.createElement(w.props.header && r === 0 ? "th" : "td");
      cell.textContent = c;
      tr.appendChild(cell);
    });
    tbl.appendChild(tr);
  });
  el.appendChild(tbl);
};

const link: Render = (el, w) => {
  if (w.type !== "link") return;
  el.appendChild(div("link-label", w.props.label));
  el.appendChild(div("link-url", w.props.url.replace(/^https?:\/\//, "")));
};

const banner: Render = (el, w) => {
  if (w.type !== "banner") return;
  el.appendChild(div("banner-text", w.props.content));
};

const definition: Render = (el, w) => {
  if (w.type !== "definition") return;
  el.appendChild(div("def-term", w.props.term));
  el.appendChild(div("def-meaning", w.props.meaning));
};

const spacer: Render = () => {
  // intentionally blank — reserves space
};

// ---------- numbers & metrics ----------

const stat: Render = (el, w, data) => {
  if (w.type !== "stat") return;
  el.appendChild(div("stat-value", boundStr(w, data, "value")));
  el.appendChild(div("stat-label", w.props.label));
};

const metric: Render = (el, w, data) => {
  if (w.type !== "metric") return;
  el.appendChild(div("metric-label", w.props.label));
  const valRow = div("metric-row");
  valRow.appendChild(div("metric-value", boundStr(w, data, "value")));
  if (w.props.unit) valRow.appendChild(div("metric-unit", w.props.unit));
  el.appendChild(valRow);
  if (w.props.delta) {
    const up = /^\+|▲|↑/.test(w.props.delta);
    const down = /^-|▼|↓/.test(w.props.delta);
    const d = div("metric-delta", w.props.delta);
    d.classList.add(up ? "up" : down ? "down" : "flat");
    el.appendChild(d);
  }
};

const progress: Render = (el, w, data) => {
  if (w.type !== "progress") return;
  const pct = Math.max(0, Math.min(100, boundNum(w, data, "value")));
  const head = div("progress-head");
  if (w.props.label) head.appendChild(div("progress-label", w.props.label));
  head.appendChild(div("progress-pct", `${Math.round(pct)}%`));
  el.appendChild(head);
  const bar = div("bar");
  const fill = div("bar-fill");
  fill.style.width = `${pct}%`;
  bar.appendChild(fill);
  el.appendChild(bar);
};

const rating: Render = (el, w) => {
  if (w.type !== "rating") return;
  const full = Math.round(w.props.value);
  el.appendChild(div("rating-stars", "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full)));
  if (w.props.label) el.appendChild(div("rating-label", w.props.label));
};

const gauge: Render = (el, w, data) => {
  if (w.type !== "gauge") return;
  const pct = Math.max(0, Math.min(100, boundNum(w, data, "value")));
  const r = 42;
  const circ = 2 * Math.PI * r;
  const wrap = div("gauge");
  wrap.innerHTML = `<svg viewBox="0 0 100 100" class="gauge-svg"><circle cx="50" cy="50" r="${r}" class="gauge-track"/><circle cx="50" cy="50" r="${r}" class="gauge-fill" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct / 100)}" transform="rotate(-90 50 50)"/></svg>`;
  wrap.appendChild(div("gauge-value", `${Math.round(pct)}%`));
  if (w.props.label) wrap.appendChild(div("gauge-label", w.props.label));
  el.appendChild(wrap);
};

// ---------- time ----------

const worldClock: Render = (el, w) => {
  if (w.type !== "worldClock") return;
  el.appendChild(div("widget-heading", w.props.label));
  const t = div("clock-time");
  el.appendChild(t);
  return every(1000, () => {
    t.textContent = fmtTime(new Date(), { hour: "2-digit", minute: "2-digit", timeZone: w.props.timeZone });
  });
};

const countdown: Render = (el, w) => {
  if (w.type !== "countdown") return;
  el.appendChild(div("widget-heading", w.props.label));
  const big = div("countdown-value");
  el.appendChild(big);
  const target = new Date(w.props.target).getTime();
  return every(1000, () => {
    let ms = target - Date.now();
    if (isNaN(target)) {
      big.textContent = "—";
      return;
    }
    const past = ms < 0;
    ms = Math.abs(ms);
    const d = Math.floor(ms / 86_400_000);
    const h = Math.floor((ms % 86_400_000) / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    big.textContent = (d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`) + (past ? " ago" : "");
  });
};

const daysUntil: Render = (el, w) => {
  if (w.type !== "daysUntil") return;
  el.appendChild(div("widget-heading", w.props.label));
  const big = div("countdown-value");
  el.appendChild(big);
  return every(60_000, () => {
    const target = new Date(w.props.target);
    if (isNaN(target.getTime())) {
      big.textContent = "—";
      return;
    }
    const today = new Date();
    const d = Math.round((target.setHours(0, 0, 0, 0) - new Date(today.setHours(0, 0, 0, 0)).getTime()) / 86_400_000);
    big.textContent = d === 0 ? "Today" : d > 0 ? `in ${d} day${d > 1 ? "s" : ""}` : `${-d} day${d < -1 ? "s" : ""} ago`;
  });
};

const weekNumber: Render = (el, w) => {
  if (w.type !== "weekNumber") return;
  el.appendChild(div("widget-heading", w.props.label));
  const big = div("stat-value");
  el.appendChild(big);
  return every(60_000, () => {
    big.textContent = `W${isoWeek(new Date())}`;
  });
};

const dateBadge: Render = (el, w) => {
  if (w.type !== "dateBadge") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const badge = div("date-badge");
  const month = div("date-month");
  const day = div("date-day");
  const weekday = div("date-weekday");
  badge.append(month, day, weekday);
  el.appendChild(badge);
  return every(60_000, () => {
    const now = new Date();
    month.textContent = now.toLocaleDateString([], { month: "short" }).toUpperCase();
    day.textContent = String(now.getDate());
    weekday.textContent = now.toLocaleDateString([], { weekday: "long" });
  });
};

const timer: Render = (el, w) => {
  if (w.type !== "timer") return;
  el.appendChild(div("widget-heading", w.props.label));
  const big = div("stat-value");
  const sub = div("stat-label");
  el.append(big, sub);
  return every(60_000, () => {
    const since = new Date(w.props.since).getTime();
    if (isNaN(since)) {
      big.textContent = "—";
      return;
    }
    const days = Math.floor((Date.now() - since) / 86_400_000);
    big.textContent = String(Math.abs(days));
    sub.textContent = `day${Math.abs(days) === 1 ? "" : "s"}`;
  });
};

const analogClock: Render = (el, w) => {
  if (w.type !== "analogClock") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const wrap = div("analog");
  wrap.innerHTML =
    '<svg viewBox="0 0 100 100" class="analog-svg"><circle cx="50" cy="50" r="46" class="analog-face"/>' +
    '<line x1="50" y1="50" x2="50" y2="26" class="analog-hour"/>' +
    '<line x1="50" y1="50" x2="50" y2="16" class="analog-min"/>' +
    '<line x1="50" y1="50" x2="50" y2="12" class="analog-sec"/>' +
    '<circle cx="50" cy="50" r="2.5" class="analog-pin"/></svg>';
  el.appendChild(wrap);
  const hour = wrap.querySelector(".analog-hour") as SVGLineElement;
  const min = wrap.querySelector(".analog-min") as SVGLineElement;
  const sec = wrap.querySelector(".analog-sec") as SVGLineElement;
  return every(1000, () => {
    const n = new Date();
    const set = (line: SVGLineElement, deg: number) => line.setAttribute("transform", `rotate(${deg} 50 50)`);
    set(hour, (n.getHours() % 12) * 30 + n.getMinutes() * 0.5);
    set(min, n.getMinutes() * 6);
    set(sec, n.getSeconds() * 6);
  });
};

// ---------- nature ----------

const moonPhaseR: Render = (el, w) => {
  if (w.type !== "moonPhase") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const emoji = div("moon-emoji");
  const name = div("moon-name");
  el.append(emoji, name);
  return every(3_600_000, () => {
    const m = moonPhase(new Date());
    emoji.textContent = m.emoji;
    name.textContent = `${m.name} · ${m.illumination}%`;
  });
};

const sunriseSunset: Render = (el, w) => {
  if (w.type !== "sunriseSunset") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const wrap = div("sun");
  el.appendChild(wrap);
  return every(60_000, () => {
    wrap.innerHTML = "";
    const t = sunTimes(new Date(), w.props.latitude, w.props.longitude);
    if (!t) {
      wrap.appendChild(div("placeholder", "polar day/night"));
      return;
    }
    const up = div("sun-row");
    up.append(div("sun-ico", "↑"), div("sun-time", fmtTime(t.sunrise, { hour: "2-digit", minute: "2-digit" })));
    const down = div("sun-row");
    down.append(div("sun-ico", "↓"), div("sun-time", fmtTime(t.sunset, { hour: "2-digit", minute: "2-digit" })));
    wrap.append(up, down);
  });
};

// ---------- visual & identity ----------

const icon: Render = (el, w) => {
  if (w.type !== "icon") return;
  el.appendChild(div("big-icon", w.props.symbol));
  if (w.props.label) el.appendChild(div("icon-label", w.props.label));
};

const avatar: Render = (el, w) => {
  if (w.type !== "avatar") return;
  const img = document.createElement("img");
  img.className = "avatar-img";
  img.alt = "";
  img.onerror = () => img.replaceWith(div("avatar-fallback", (w.props.name[0] ?? "?").toUpperCase()));
  img.src = w.props.url;
  el.appendChild(img);
  el.appendChild(div("avatar-name", w.props.name));
  if (w.props.role) el.appendChild(div("avatar-role", w.props.role));
};

const badge: Render = (el, w) => {
  if (w.type !== "badge") return;
  el.appendChild(div("pill", w.props.text));
};

const nameTag: Render = (el, w) => {
  if (w.type !== "nameTag") return;
  el.appendChild(div("nametag-name", w.props.name));
  if (w.props.subtitle) el.appendChild(div("nametag-sub", w.props.subtitle));
};

// ---------- place & info ----------

const hours: Render = (el, w) => {
  if (w.type !== "hours") return;
  const list = div("kv");
  for (const ln of lines(w.props.content)) {
    const idx = ln.indexOf(":");
    const row = div("kv-row");
    row.appendChild(div("kv-key", idx === -1 ? ln : ln.slice(0, idx).trim()));
    row.appendChild(div("kv-val", idx === -1 ? "" : ln.slice(idx + 1).trim()));
    list.appendChild(row);
  }
  el.appendChild(list);
};

const menuList: Render = (el, w) => {
  if (w.type !== "menuList") return;
  const list = div("menu");
  for (const ln of lines(w.props.content)) {
    const idx = ln.lastIndexOf("|");
    const row = div("menu-row");
    row.appendChild(div("menu-item", idx === -1 ? ln : ln.slice(0, idx).trim()));
    if (idx !== -1) {
      row.appendChild(div("menu-dots"));
      row.appendChild(div("menu-price", ln.slice(idx + 1).trim()));
    }
    list.appendChild(row);
  }
  el.appendChild(list);
};

// ---------- smart-home placeholders ----------

const deviceStatus: Render = (el, w) => {
  if (w.type !== "deviceStatus") return;
  el.appendChild(div("widget-heading", w.props.label));
  const row = div("device-row");
  const dot = div(`device-dot ${w.props.state === "on" ? "on" : "off"}`);
  row.append(dot, div("device-state", w.props.state.toUpperCase()));
  el.appendChild(row);
};

const sensor: Render = (el, w) => {
  if (w.type !== "sensor") return;
  el.appendChild(div("widget-heading", w.props.label));
  const row = div("metric-row");
  row.append(div("metric-value", w.props.value));
  if (w.props.unit) row.append(div("metric-unit", w.props.unit));
  el.appendChild(row);
};

const thermostat: Render = (el, w) => {
  if (w.type !== "thermostat") return;
  el.appendChild(div("widget-heading", w.props.label));
  el.appendChild(div("thermo-temp", `${w.props.temperature}°${w.props.unit}`));
};

// ===================== v0.6 blocks =====================

const heading2 = (el: HTMLElement, label?: string) => {
  if (label) el.appendChild(div("widget-heading", label));
};

// ---- text & structure ----

const lead: Render = (el, w) => {
  if (w.type !== "lead") return;
  el.appendChild(div("lead", w.props.content));
};

const pullquote: Render = (el, w) => {
  if (w.type !== "pullquote") return;
  const wrap = div("pullquote");
  wrap.appendChild(div("pullquote-text", `“${w.props.content}”`));
  if (w.props.author) wrap.appendChild(div("pullquote-author", `— ${w.props.author}`));
  el.appendChild(wrap);
};

const dropCap: Render = (el, w) => {
  if (w.type !== "dropCap") return;
  const p = div("dropcap-text");
  const cap = document.createElement("span");
  cap.className = "dropcap";
  cap.textContent = w.props.content.charAt(0);
  p.appendChild(cap);
  p.appendChild(document.createTextNode(w.props.content.slice(1)));
  el.appendChild(p);
};

const finePrint: Render = (el, w) => {
  if (w.type !== "finePrint") return;
  el.appendChild(div("fine-print", w.props.content));
};

const numberedHeading: Render = (el, w) => {
  if (w.type !== "numberedHeading") return;
  const wrap = div("numhead");
  wrap.appendChild(div("numhead-n", w.props.number));
  wrap.appendChild(div("numhead-t", w.props.content));
  el.appendChild(wrap);
};

const verse: Render = (el, w) => {
  if (w.type !== "verse") return;
  const wrap = div("verse");
  for (const ln of w.props.content.split(/\r?\n/)) wrap.appendChild(div("verse-line", ln || " "));
  el.appendChild(wrap);
};

const ascii: Render = (el, w) => {
  if (w.type !== "ascii") return;
  const pre = document.createElement("pre");
  pre.className = "ascii";
  pre.textContent = w.props.content;
  el.appendChild(pre);
};

const tagCloud: Render = (el, w) => {
  if (w.type !== "tagCloud") return;
  const wrap = div("tagcloud");
  for (const t of w.props.tags.split(",").map((s) => s.trim()).filter(Boolean)) wrap.appendChild(div("tag", t));
  el.appendChild(wrap);
};

const timeline: Render = (el, w) => {
  if (w.type !== "timeline") return;
  const list = div("timeline");
  for (const ln of lines(w.props.items)) {
    const i = ln.indexOf("|");
    const row = div("tl-row");
    row.appendChild(div("tl-dot"));
    const body = div("tl-body");
    body.appendChild(div("tl-time", i === -1 ? ln : ln.slice(0, i).trim()));
    if (i !== -1) body.appendChild(div("tl-text", ln.slice(i + 1).trim()));
    row.appendChild(body);
    list.appendChild(row);
  }
  el.appendChild(list);
};

const steps: Render = (el, w) => {
  if (w.type !== "steps") return;
  const list = div("steps");
  lines(w.props.items).forEach((s, i) => {
    const row = div("step-row");
    row.appendChild(div("step-n", String(i + 1)));
    row.appendChild(div("step-t", s));
    list.appendChild(row);
  });
  el.appendChild(list);
};

const faq: Render = (el, w) => {
  if (w.type !== "faq") return;
  const list = div("faq");
  for (const ln of lines(w.props.items)) {
    const i = ln.indexOf("|");
    const row = div("faq-row");
    row.appendChild(div("faq-q", i === -1 ? ln : ln.slice(0, i).trim()));
    if (i !== -1) row.appendChild(div("faq-a", ln.slice(i + 1).trim()));
    list.appendChild(row);
  }
  el.appendChild(list);
};

const prosCons: Render = (el, w) => {
  if (w.type !== "prosCons") return;
  const wrap = div("proscons");
  const col = (title: string, items: string, sign: string) => {
    const c = div("pc-col");
    c.appendChild(div("pc-title", title));
    for (const it of lines(items)) {
      const r = div("pc-item");
      r.appendChild(div("pc-sign", sign));
      r.appendChild(div("pc-text", it));
      c.appendChild(r);
    }
    return c;
  };
  wrap.appendChild(col("Pros", w.props.pros, "+"));
  wrap.appendChild(col("Cons", w.props.cons, "−"));
  el.appendChild(wrap);
};

// ---- charts ----

const sparkline: Render = (el, w, data) => {
  if (w.type !== "sparkline") return;
  heading2(el, w.props.label);
  const v = boundNums(w, data);
  const wrap = div("spark");
  wrap.innerHTML = sparkSvg(v);
  el.appendChild(wrap);
  if (v.length) el.appendChild(div("spark-last", String(v[v.length - 1])));
};

const barChart: Render = (el, w, data) => {
  if (w.type !== "barChart") return;
  heading2(el, w.props.label);
  const wrap = div("barchart");
  wrap.innerHTML = barSvg(boundNums(w, data));
  el.appendChild(wrap);
};

const progressRing: Render = (el, w) => {
  if (w.type !== "progressRing") return;
  const wrap = div("ring");
  wrap.innerHTML = ringSvg(w.props.value);
  wrap.appendChild(div("ring-value", `${Math.round(w.props.value)}%`));
  if (w.props.label) wrap.appendChild(div("ring-label", w.props.label));
  el.appendChild(wrap);
};

const dotProgress: Render = (el, w) => {
  if (w.type !== "dotProgress") return;
  heading2(el, w.props.label);
  const wrap = div("dotprog");
  for (let i = 0; i < w.props.total; i++) wrap.appendChild(div(`dp-dot ${i < w.props.value ? "on" : ""}`));
  el.appendChild(wrap);
  el.appendChild(div("dp-count", `${w.props.value}/${w.props.total}`));
};

const scoreboard: Render = (el, w) => {
  if (w.type !== "scoreboard") return;
  const wrap = div("scoreboard");
  const side = (label: string, score: string) => {
    const c = div("sb-side");
    c.appendChild(div("sb-score", score));
    c.appendChild(div("sb-team", label));
    return c;
  };
  wrap.appendChild(side(w.props.leftLabel, w.props.leftScore));
  wrap.appendChild(div("sb-sep", "–"));
  wrap.appendChild(side(w.props.rightLabel, w.props.rightScore));
  el.appendChild(wrap);
};

const fraction: Render = (el, w) => {
  if (w.type !== "fraction") return;
  const wrap = div("fraction");
  wrap.appendChild(div("fr-num", w.props.numerator));
  wrap.appendChild(div("fr-bar"));
  wrap.appendChild(div("fr-den", w.props.denominator));
  el.appendChild(wrap);
  if (w.props.label) el.appendChild(div("fr-label", w.props.label));
};

const tally: Render = (el, w) => {
  if (w.type !== "tally") return;
  heading2(el, w.props.label);
  const wrap = div("tally");
  const group = (count: number) => {
    const g = div(`tally-group${count === 5 ? " five" : ""}`);
    for (let i = 0; i < count; i++) g.appendChild(div("tally-mark"));
    return g;
  };
  const full = Math.floor(w.props.value / 5);
  const rem = w.props.value % 5;
  for (let i = 0; i < full; i++) wrap.appendChild(group(5));
  if (rem) wrap.appendChild(group(rem));
  el.appendChild(wrap);
  el.appendChild(div("tally-num", String(w.props.value)));
};

const heatStrip: Render = (el, w, data) => {
  if (w.type !== "heatStrip") return;
  heading2(el, w.props.label);
  const v = boundNums(w, data);
  const max = Math.max(1, ...v);
  const wrap = div("heatstrip");
  for (const n of v) {
    const c = div("heat-cell");
    c.style.opacity = String(0.12 + (n / max) * 0.88);
    wrap.appendChild(c);
  }
  el.appendChild(wrap);
};

const trend: Render = (el, w, data) => {
  if (w.type !== "trend") return;
  heading2(el, w.props.label);
  el.appendChild(div("trend-value", boundStr(w, data, "value")));
  const up = /^\+|▲|↑/.test(w.props.delta);
  const down = /^-|−|▼|↓/.test(w.props.delta);
  el.appendChild(div(`trend-delta ${up ? "up" : down ? "down" : "flat"}`, `${up ? "↑ " : down ? "↓ " : ""}${w.props.delta}`));
};

const kpiSpark: Render = (el, w, data) => {
  if (w.type !== "kpiSpark") return;
  heading2(el, w.props.label);
  const row = div("metric-row");
  row.appendChild(div("metric-value", w.props.value));
  if (w.props.unit) row.appendChild(div("metric-unit", w.props.unit));
  el.appendChild(row);
  const sp = div("spark");
  sp.innerHTML = sparkSvg(boundNums(w, data));
  el.appendChild(sp);
};

// ---- time computed ----

const bar = (el: HTMLElement, label: string, pct: number) => {
  el.innerHTML = "";
  const head = div("progress-head");
  head.appendChild(div("progress-label", label));
  head.appendChild(div("progress-pct", `${Math.round(pct)}%`));
  el.appendChild(head);
  const b = div("bar");
  const f = div("bar-fill");
  f.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  b.appendChild(f);
  el.appendChild(b);
};

const dayProgress: Render = (el, w) => {
  if (w.type !== "dayProgress") return;
  return every(60_000, () => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    bar(el, w.props.label, ((now.getTime() - start.getTime()) / 86_400_000) * 100);
  });
};

const yearProgress: Render = (el, w) => {
  if (w.type !== "yearProgress") return;
  return every(60_000, () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1).getTime();
    const end = new Date(now.getFullYear() + 1, 0, 1).getTime();
    bar(el, w.props.label, ((now.getTime() - start) / (end - start)) * 100);
  });
};

const weekProgress: Render = (el, w) => {
  if (w.type !== "weekProgress") return;
  return every(60_000, () => {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // Monday = 0
    const elapsed = dow * 86_400_000 + (now.getTime() - new Date(now).setHours(0, 0, 0, 0));
    bar(el, w.props.label, (elapsed / (7 * 86_400_000)) * 100);
  });
};

const greeting: Render = (el, w) => {
  if (w.type !== "greeting") return;
  const g = div("greeting");
  el.appendChild(g);
  return every(60_000, () => {
    const h = new Date().getHours();
    const part = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Good night";
    g.textContent = w.props.name ? `${part}, ${w.props.name}.` : `${part}.`;
  });
};

const romanClock: Render = (el, w) => {
  if (w.type !== "romanClock") return;
  heading2(el, w.props.label);
  const t = div("roman-time");
  el.appendChild(t);
  return every(1000, () => {
    t.textContent = romanTime(new Date());
  });
};

const binaryClock: Render = (el, w) => {
  if (w.type !== "binaryClock") return;
  heading2(el, w.props.label);
  const grid = div("binary");
  el.appendChild(grid);
  return every(1000, () => {
    grid.innerHTML = "";
    const n = new Date();
    for (const val of [n.getHours(), n.getMinutes(), n.getSeconds()]) {
      const col = div("bin-col");
      for (let bit = 5; bit >= 0; bit--) col.appendChild(div(`bin-dot ${(val >> bit) & 1 ? "on" : ""}`));
      grid.appendChild(col);
    }
  });
};

const seasonClock: Render = (el, w) => {
  if (w.type !== "seasonClock") return;
  heading2(el, w.props.label);
  const s = seasonOf(new Date().getMonth(), w.props.hemisphere);
  el.appendChild(div("season-emoji", s.emoji));
  el.appendChild(div("season-name", s.name));
};

const zodiac: Render = (el, w) => {
  if (w.type !== "zodiac") return;
  heading2(el, w.props.label);
  const d = new Date(w.props.date);
  const z = isNaN(d.getTime()) ? { sign: "—", emoji: "?" } : zodiacOf(d.getMonth() + 1, d.getDate());
  el.appendChild(div("zodiac-emoji", z.emoji));
  el.appendChild(div("zodiac-sign", z.sign));
};

// ---- trackers & cards ----

const habitTracker: Render = (el, w) => {
  if (w.type !== "habitTracker") return;
  heading2(el, w.props.label);
  const wrap = div("habit");
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  w.props.days.trim().split(/\s+/).slice(0, 7).forEach((t, i) => {
    const col = div("habit-col");
    col.appendChild(div(`habit-dot ${/^(x|1|✓)$/i.test(t) ? "on" : ""}`));
    col.appendChild(div("habit-day", days[i] ?? ""));
    wrap.appendChild(col);
  });
  el.appendChild(wrap);
};

const streak: Render = (el, w) => {
  if (w.type !== "streak") return;
  el.appendChild(div("stat-value", String(w.props.value)));
  el.appendChild(div("stat-label", w.props.label));
};

const waterTracker: Render = (el, w) => {
  if (w.type !== "waterTracker") return;
  heading2(el, w.props.label);
  const wrap = div("water");
  for (let i = 0; i < w.props.total; i++) wrap.appendChild(div("water-glass", i < w.props.value ? "▮" : "▯"));
  el.appendChild(wrap);
  el.appendChild(div("dp-count", `${w.props.value}/${w.props.total}`));
};

const wifiCard: Render = (el, w) => {
  if (w.type !== "wifiCard") return;
  heading2(el, w.props.label);
  const list = div("kv");
  const row = (k: string, v: string) => {
    const r = div("kv-row");
    r.appendChild(div("kv-key", k));
    r.appendChild(div("kv-val", v));
    return r;
  };
  list.appendChild(row("Network", w.props.ssid));
  list.appendChild(row("Password", w.props.password));
  el.appendChild(list);
};

// ---- live ----

const placeholder = (el: HTMLElement, text: string): void => {
  el.appendChild(div("placeholder", text));
};

const forecast: Render = (el, w, data) => {
  if (w.type !== "forecast") return;
  heading2(el, w.props.label);
  const d = data as ForecastDataT | null;
  if (!d) return placeholder(el, "forecast unavailable");
  const wrap = div("forecast");
  for (const day of d.days) {
    const c = div("fc-day");
    c.appendChild(div("fc-name", day.day));
    c.appendChild(div("fc-temp", `${day.hi}°`));
    c.appendChild(div("fc-lo", `${day.lo}°`));
    wrap.appendChild(c);
  }
  el.appendChild(wrap);
};

const windCompass: Render = (el, w, data) => {
  if (w.type !== "windCompass") return;
  heading2(el, w.props.label);
  const d = data as WindDataT | null;
  if (!d) return placeholder(el, "wind unavailable");
  const wrap = div("wind");
  wrap.innerHTML = `<svg viewBox="0 0 100 100" class="wind-svg"><circle cx="50" cy="50" r="44" class="wind-ring"/><path d="M50 12 L58 54 L50 46 L42 54 Z" class="wind-arrow" transform="rotate(${d.deg} 50 50)"/></svg>`;
  wrap.appendChild(div("wind-read", `${d.speed} km/h ${d.dir}`));
  el.appendChild(wrap);
};

const uvIndex: Render = (el, w, data) => {
  if (w.type !== "uvIndex") return;
  heading2(el, w.props.label);
  const d = data as UvDataT | null;
  if (!d) return placeholder(el, "UV unavailable");
  el.appendChild(div("stat-value", String(d.value)));
  el.appendChild(div("stat-label", `UV · ${d.level}`));
};

const airQuality: Render = (el, w, data) => {
  if (w.type !== "airQuality") return;
  heading2(el, w.props.label);
  const d = data as AirQualityDataT | null;
  if (!d) return placeholder(el, "AQI unavailable");
  el.appendChild(div("stat-value", String(d.aqi)));
  el.appendChild(div("stat-label", `AQI · ${d.level}`));
  el.appendChild(div("metric-label", `PM2.5 ${d.pm25}`));
};

const precip: Render = (el, w, data) => {
  if (w.type !== "precip") return;
  heading2(el, w.props.label);
  const d = data as PrecipDataT | null;
  if (!d) return placeholder(el, "—");
  el.appendChild(div("stat-value", `${d.probability}%`));
  el.appendChild(div("stat-label", `rain · ${d.summary}`));
};

const feedList = (el: HTMLElement, label: string, data: unknown) => {
  heading2(el, label);
  const d = data as HeadlinesDataT | null;
  if (!d || d.items.length === 0) return placeholder(el, d?.error ?? "no items");
  const list = div("feed");
  for (const t of d.items) list.appendChild(div("feed-item", t));
  el.appendChild(list);
};
const headlines: Render = (el, w, data) => {
  if (w.type !== "headlines") return;
  feedList(el, w.props.label, data);
};
const hackerNews: Render = (el, w, data) => {
  if (w.type !== "hackerNews") return;
  feedList(el, w.props.label, data);
};

const currencyRate: Render = (el, w, data) => {
  if (w.type !== "currencyRate") return;
  const d = data as CurrencyDataT | null;
  heading2(el, w.props.label || `${w.props.from}/${w.props.to}`);
  if (!d) return placeholder(el, "rate unavailable");
  el.appendChild(div("stat-value", d.rate.toFixed(2)));
  el.appendChild(div("stat-label", `1 ${d.from} → ${d.to}`));
};

const cryptoPrice: Render = (el, w, data) => {
  if (w.type !== "cryptoPrice") return;
  const d = data as CryptoDataT | null;
  heading2(el, w.props.label || w.props.coin);
  if (!d) return placeholder(el, "price unavailable");
  el.appendChild(div("stat-value", d.price.toLocaleString()));
  if (d.change !== undefined) {
    const up = d.change >= 0;
    el.appendChild(div(`trend-delta ${up ? "up" : "down"}`, `${up ? "↑" : "↓"} ${Math.abs(d.change).toFixed(1)}% · ${d.vs.toUpperCase()}`));
  }
};

const onThisDay: Render = (el, w, data) => {
  if (w.type !== "onThisDay") return;
  heading2(el, w.props.label);
  const d = data as OnThisDayDataT | null;
  if (!d || d.items.length === 0) return placeholder(el, "unavailable");
  const list = div("feed");
  for (const e of d.items) {
    const r = div("otd-row");
    r.appendChild(div("otd-year", String(e.year)));
    r.appendChild(div("otd-text", e.text));
    list.appendChild(r);
  }
  el.appendChild(list);
};

const wikiToday: Render = (el, w, data) => {
  if (w.type !== "wikiToday") return;
  heading2(el, w.props.label);
  const d = data as WikiDataT | null;
  if (!d) return placeholder(el, "unavailable");
  el.appendChild(div("wiki-title", d.title));
  el.appendChild(div("wiki-extract", d.extract));
};

const quoteLive: Render = (el, w, data) => {
  if (w.type !== "quoteLive") return;
  heading2(el, w.props.label);
  const d = data as QuoteLiveDataT | null;
  if (!d) return placeholder(el, "unavailable");
  const wrap = div("quote");
  wrap.appendChild(div("quote-text", `“${d.text}”`));
  wrap.appendChild(div("quote-author", `— ${d.author}`));
  el.appendChild(wrap);
};

const factLive: Render = (el, w, data) => {
  if (w.type !== "factLive") return;
  heading2(el, w.props.label);
  const d = data as FactDataT | null;
  if (!d) return placeholder(el, "unavailable");
  el.appendChild(div("fact-text", d.text));
};

const githubStats: Render = (el, w, data) => {
  if (w.type !== "githubStats") return;
  const d = data as GithubDataT | null;
  heading2(el, w.props.label || (d ? d.name : "GitHub"));
  if (!d) return placeholder(el, "unavailable");
  el.appendChild(div("stat-value", d.value.toLocaleString()));
  el.appendChild(div("stat-label", d.metric));
};

const nextHoliday: Render = (el, w, data) => {
  if (w.type !== "nextHoliday") return;
  heading2(el, w.props.label);
  const d = data as HolidayDataT | null;
  if (!d) return placeholder(el, "unavailable");
  el.appendChild(div("holiday-name", d.name));
  el.appendChild(div("holiday-when", d.daysUntil === 0 ? "today" : `in ${d.daysUntil} day${d.daysUntil > 1 ? "s" : ""}`));
};

const issNow: Render = (el, w, data) => {
  if (w.type !== "issNow") return;
  heading2(el, w.props.label);
  const d = data as IssDataT | null;
  if (!d) return placeholder(el, "unavailable");
  el.appendChild(div("iss-coord", `${Math.abs(d.latitude)}°${d.latitude >= 0 ? "N" : "S"}`));
  el.appendChild(div("iss-coord", `${Math.abs(d.longitude)}°${d.longitude >= 0 ? "E" : "W"}`));
};

const jsonFeed: Render = (el, w, data) => {
  if (w.type !== "jsonFeed") return;
  heading2(el, w.props.label);
  const d = data as { lines: string[]; error?: string } | null;
  if (!d || d.lines.length === 0) return placeholder(el, d?.error ?? "no data");
  const list = div("feed");
  for (const ln of d.lines) list.appendChild(div("feed-line", ln));
  el.appendChild(list);
};

// ===================== v0.8 blocks =====================

const pipes = (s: string): Array<[string, string]> =>
  lines(s).map((ln) => {
    const i = ln.indexOf("|");
    return i === -1 ? [ln.trim(), ""] : [ln.slice(0, i).trim(), ln.slice(i + 1).trim()];
  });

// ---- text & structure ----
const signature: Render = (el, w) => {
  if (w.type !== "signature") return;
  el.appendChild(div("sig-rule"));
  el.appendChild(div("sig-name", w.props.name));
  if (w.props.role) el.appendChild(div("sig-role", w.props.role));
};
const address: Render = (el, w) => {
  if (w.type !== "address") return;
  el.appendChild(div("address", w.props.content));
};
const byline: Render = (el, w) => {
  if (w.type !== "byline") return;
  el.appendChild(div("byline", `${w.props.author} · ${w.props.date}`));
};
const legend: Render = (el, w) => {
  if (w.type !== "legend") return;
  const list = div("legend");
  for (const ln of lines(w.props.items)) list.appendChild(div("legend-row", ln));
  el.appendChild(list);
};
const breadcrumb: Render = (el, w) => {
  if (w.type !== "breadcrumb") return;
  el.appendChild(div("breadcrumb", w.props.path));
};
const noticeBar: Render = (el, w) => {
  if (w.type !== "noticeBar") return;
  const row = div("notice");
  row.append(div("notice-icon", w.props.icon), div("notice-text", w.props.content));
  el.appendChild(row);
};
const keyCombo: Render = (el, w) => {
  if (w.type !== "keyCombo") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const row = div("keycombo");
  w.props.keys.trim().split(/\s+/).forEach((k, i) => {
    if (i > 0) row.appendChild(div("kc-plus", "+"));
    row.appendChild(div("kc-key", k));
  });
  el.appendChild(row);
};
const dividerLabeled: Render = (el, w) => {
  if (w.type !== "dividerLabeled") return;
  const row = div("divlabeled");
  row.append(div("dl-rule"), div("dl-label", w.props.label), div("dl-rule"));
  el.appendChild(row);
};

// ---- visual & layout ----
const iconRow: Render = (el, w) => {
  if (w.type !== "iconRow") return;
  const row = div("iconrow");
  for (const s of w.props.symbols.trim().split(/\s+/)) row.appendChild(div("ir-icon", s));
  el.appendChild(row);
};
const statRow: Render = (el, w) => {
  if (w.type !== "statRow") return;
  const row = div("statrow");
  for (const [v, label] of pipes(w.props.items)) {
    const c = div("sr-cell");
    c.append(div("sr-value", v), div("sr-label", label));
    row.appendChild(c);
  }
  el.appendChild(row);
};
const spacerDots: Render = (el) => {
  el.appendChild(div("spacer-dots", "· · ·"));
};
const frame: Render = (el, w) => {
  if (w.type !== "frame") return;
  const box = div("frame");
  box.append(div("frame-label", w.props.label), div("frame-content", w.props.content));
  el.appendChild(box);
};

// ---- charts ----
const areaSvg = (values: number[]): string => {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 100;
  const H = 30;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - ((v - min) / range) * H).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="area-svg"><polygon points="0,${H} ${pts} ${W},${H}"/></svg>`;
};
const lineChart: Render = (el, w, data) => {
  if (w.type !== "lineChart") return;
  heading2(el, w.props.label);
  const wrap = div("linechart");
  wrap.innerHTML = sparkSvg(boundNums(w, data));
  el.appendChild(wrap);
};
const areaChart: Render = (el, w, data) => {
  if (w.type !== "areaChart") return;
  heading2(el, w.props.label);
  const wrap = div("areachart");
  wrap.innerHTML = areaSvg(boundNums(w, data));
  el.appendChild(wrap);
};
const bulletGraph: Render = (el, w) => {
  if (w.type !== "bulletGraph") return;
  heading2(el, w.props.label);
  const scale = Math.max(w.props.value, w.props.target, 1);
  const wrap = div("bullet");
  const fill = div("bullet-fill");
  fill.style.width = `${(w.props.value / scale) * 100}%`;
  const tick = div("bullet-tick");
  tick.style.left = `${(w.props.target / scale) * 100}%`;
  wrap.append(fill, tick);
  el.appendChild(wrap);
  el.appendChild(div("bullet-read", `${w.props.value} / ${w.props.target}`));
};
const horizontalBars: Render = (el, w) => {
  if (w.type !== "horizontalBars") return;
  const rows = pipes(w.props.items).map(([l, v]) => [l, Number(v) || 0] as [string, number]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  const list = div("hbars");
  for (const [label, v] of rows) {
    const row = div("hb-row");
    row.appendChild(div("hb-label", label));
    const track = div("hb-track");
    const fill = div("hb-fill");
    fill.style.width = `${(v / max) * 100}%`;
    track.appendChild(fill);
    row.append(track, div("hb-val", String(v)));
    list.appendChild(row);
  }
  el.appendChild(list);
};
const rankingList: Render = (el, w) => {
  if (w.type !== "rankingList") return;
  const rows = pipes(w.props.items).map(([l, v]) => [l, Number(v) || 0] as [string, number]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  const list = div("ranking");
  rows.forEach(([label, v], i) => {
    const row = div("rk-row");
    row.appendChild(div("rk-pos", String(i + 1)));
    row.appendChild(div("rk-name", label));
    const track = div("hb-track");
    const fill = div("hb-fill");
    fill.style.width = `${(v / max) * 100}%`;
    track.appendChild(fill);
    row.append(track, div("rk-val", String(v)));
    list.appendChild(row);
  });
  el.appendChild(list);
};
const waffle: Render = (el, w) => {
  if (w.type !== "waffle") return;
  heading2(el, w.props.label);
  const filled = Math.round((Math.max(0, Math.min(100, w.props.value)) / 100) * 100);
  const grid = div("waffle");
  for (let i = 0; i < 100; i++) grid.appendChild(div(`wf-cell${i < filled ? " on" : ""}`));
  el.appendChild(grid);
  el.appendChild(div("dp-count", `${Math.round(w.props.value)}%`));
};
const signalBars: Render = (el, w) => {
  if (w.type !== "signalBars") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const wrap = div("signalbars");
  for (let i = 0; i < 5; i++) {
    const bar = div(`sb-bar${i < w.props.value ? " on" : ""}`);
    bar.style.height = `${30 + i * 17}%`;
    wrap.appendChild(bar);
  }
  el.appendChild(wrap);
};
const thermometer: Render = (el, w) => {
  if (w.type !== "thermometer") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const pct = Math.max(0, Math.min(1, (w.props.value - w.props.min) / (w.props.max - w.props.min || 1)));
  const wrap = div("thermo");
  const tube = div("thermo-tube");
  const fill = div("thermo-fill");
  fill.style.height = `${pct * 100}%`;
  tube.appendChild(fill);
  wrap.append(tube, div("thermo-val", `${w.props.value}${w.props.unit}`));
  el.appendChild(wrap);
};
const comparison: Render = (el, w) => {
  if (w.type !== "comparison") return;
  const total = Math.max(1, w.props.leftValue + w.props.rightValue);
  const wrap = div("compare");
  const bar = div("cmp-bar");
  const l = div("cmp-left");
  l.style.width = `${(w.props.leftValue / total) * 100}%`;
  const r = div("cmp-right");
  r.style.width = `${(w.props.rightValue / total) * 100}%`;
  bar.append(l, r);
  const legendRow = div("cmp-legend");
  legendRow.append(div("cmp-l", `${w.props.leftLabel} ${w.props.leftValue}`), div("cmp-r", `${w.props.rightValue} ${w.props.rightLabel}`));
  el.append(bar, legendRow);
};
const percentList: Render = (el, w) => {
  if (w.type !== "percentList") return;
  const rows = pipes(w.props.items).map(([l, v]) => [l, Number(v) || 0] as [string, number]);
  const total = Math.max(1, rows.reduce((n, r) => n + r[1], 0));
  const bar = div("pct-bar");
  rows.forEach(([, v], i) => {
    const seg = div(`pct-seg pct-${i % 4}`);
    seg.style.width = `${(v / total) * 100}%`;
    bar.appendChild(seg);
  });
  el.appendChild(bar);
  const leg = div("pct-legend");
  rows.forEach(([label, v]) => leg.appendChild(div("pct-item", `${label} ${Math.round((v / total) * 100)}%`)));
  el.appendChild(leg);
};

// ---- time & calendar (computed) ----
const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const monthCalendar: Render = (el, w) => {
  if (w.type !== "monthCalendar") return;
  return every(60_000, () => {
    el.innerHTML = "";
    const now = new Date();
    if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
    el.appendChild(div("cal-month", now.toLocaleDateString([], { month: "long", year: "numeric" })));
    const grid = div("month-grid");
    for (const d of DOW) grid.appendChild(div("mc-dow", d));
    const y = now.getFullYear();
    const m = now.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    for (let i = 0; i < offset; i++) grid.appendChild(div("mc-cell empty"));
    for (let d = 1; d <= days; d++) grid.appendChild(div(`mc-cell${d === now.getDate() ? " today" : ""}`, String(d)));
    el.appendChild(grid);
  });
};
const weekStrip: Render = (el, w) => {
  if (w.type !== "weekStrip") return;
  return every(60_000, () => {
    el.innerHTML = "";
    if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - dow);
    const wrap = div("weekstrip");
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const col = div(`ws-col${i === dow ? " today" : ""}`);
      col.append(div("ws-dow", DOW[i]!), div("ws-num", String(d.getDate())));
      wrap.appendChild(col);
    }
    el.appendChild(wrap);
  });
};
const nowNext: Render = (el, w) => {
  if (w.type !== "nowNext") return;
  return every(60_000, () => {
    el.innerHTML = "";
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const items = pipes(w.props.items)
      .map(([t, text]) => {
        const [h, mm] = t.split(":").map(Number);
        return { at: (h || 0) * 60 + (mm || 0), text };
      })
      .sort((a, b) => a.at - b.at);
    const current = [...items].reverse().find((i) => i.at <= mins);
    const next = items.find((i) => i.at > mins);
    if (current) {
      el.appendChild(div("nn-label", "NOW"));
      el.appendChild(div("nn-now", current.text));
    }
    if (next) {
      el.appendChild(div("nn-label", "NEXT"));
      el.appendChild(div("nn-next", `${next.text}`));
    }
    if (!current && !next) placeholder(el, "no schedule");
  });
};
const ageCounter: Render = (el, w) => {
  if (w.type !== "ageCounter") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const big = div("stat-value");
  const sub = div("stat-label");
  el.append(big, sub);
  return every(60_000, () => {
    const since = new Date(w.props.since);
    if (isNaN(since.getTime())) {
      big.textContent = "—";
      return;
    }
    const years = (Date.now() - since.getTime()) / (365.2425 * 86_400_000);
    big.textContent = String(Math.floor(years));
    sub.textContent = "years";
  });
};
const anniversary: Render = (el, w) => {
  if (w.type !== "anniversary") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const big = div("countdown-value");
  el.appendChild(big);
  return every(60_000, () => {
    const d = new Date(w.props.date);
    if (isNaN(d.getTime())) {
      big.textContent = "—";
      return;
    }
    const now = new Date();
    let next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
    if (next.getTime() < new Date(now.toDateString()).getTime()) next = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
    const days = Math.round((next.getTime() - new Date(now.toDateString()).getTime()) / 86_400_000);
    big.textContent = days === 0 ? "Today!" : `in ${days} day${days > 1 ? "s" : ""}`;
  });
};
const timeBlocks: Render = (el, w) => {
  if (w.type !== "timeBlocks") return;
  const list = div("timeblocks");
  for (const [range, text] of pipes(w.props.items)) {
    const row = div("tb-row");
    row.append(div("tb-range", range), div("tb-text", text));
    list.appendChild(row);
  }
  el.appendChild(list);
};
const shiftStatus: Render = (el, w) => {
  if (w.type !== "shiftStatus") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const big = div("openbig");
  const sub = div("stat-label");
  el.append(big, sub);
  return every(60_000, () => {
    const h = new Date().getHours();
    const open = h >= w.props.open && h < w.props.close;
    big.textContent = open ? "OPEN" : "CLOSED";
    big.classList.toggle("is-open", open);
    sub.textContent = `${w.props.open}:00 – ${w.props.close}:00`;
  });
};
const pomodoro: Render = (el, w) => {
  if (w.type !== "pomodoro") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const row = div("pomodoro");
  row.append(div("pomo-num", `${w.props.workMin}`), div("pomo-sep", "/"), div("pomo-num", `${w.props.breakMin}`));
  el.appendChild(row);
  el.appendChild(div("stat-label", "work / break min"));
};

// ---- trackers ----
const monthHabit: Render = (el, w) => {
  if (w.type !== "monthHabit") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const grid = div("monthhabit");
  w.props.days.trim().split(/\s+/).slice(0, 31).forEach((t) => grid.appendChild(div(`mh-dot${/^(x|1|✓)$/i.test(t) ? " on" : ""}`)));
  el.appendChild(grid);
};
const savingsGoal: Render = (el, w) => {
  if (w.type !== "savingsGoal") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const pct = Math.max(0, Math.min(100, (w.props.saved / (w.props.target || 1)) * 100));
  el.appendChild(div("savings-amt", `${w.props.unit}${w.props.saved.toLocaleString()}`));
  const bar = div("bar");
  const fill = div("bar-fill");
  fill.style.width = `${pct}%`;
  bar.appendChild(fill);
  el.appendChild(bar);
  el.appendChild(div("stat-label", `of ${w.props.unit}${w.props.target.toLocaleString()} · ${Math.round(pct)}%`));
};
const readingNow: Render = (el, w) => {
  if (w.type !== "readingNow") return;
  el.appendChild(div("widget-heading", "Reading"));
  el.appendChild(div("reading-title", w.props.title));
  el.appendChild(div("reading-author", w.props.author));
  const bar = div("bar");
  const fill = div("bar-fill");
  fill.style.width = `${w.props.percent}%`;
  bar.appendChild(fill);
  el.appendChild(bar);
};
const weightTrend: Render = (el, w, data) => {
  if (w.type !== "weightTrend") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const v = boundNums(w, data);
  const row = div("metric-row");
  row.append(div("metric-value", String(v[v.length - 1] ?? "—")), div("metric-unit", w.props.unit));
  el.appendChild(row);
  const sp = div("spark");
  sp.innerHTML = sparkSvg(v);
  el.appendChild(sp);
};
const moodWeek: Render = (el, w) => {
  if (w.type !== "moodWeek") return;
  const wrap = div("moodweek");
  w.props.moods.trim().split(/\s+/).slice(0, 7).forEach((m, i) => {
    const col = div("mw-col");
    col.append(div("mw-face", m), div("mw-day", DOW[i] ?? ""));
    wrap.appendChild(col);
  });
  el.appendChild(wrap);
};
const checklistProgress: Render = (el, w) => {
  if (w.type !== "checklistProgress") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const items = lines(w.props.items).map((ln) => ({ done: /^(\[?x\]?|✓)\s+/i.test(ln), text: ln.replace(/^(\[?x\]?|✓|-)\s+/i, "") }));
  const done = items.filter((i) => i.done).length;
  el.appendChild(div("stat-label", `${done}/${items.length} done`));
  const bar = div("bar");
  const fill = div("bar-fill");
  fill.style.width = `${items.length ? (done / items.length) * 100 : 0}%`;
  bar.appendChild(fill);
  el.appendChild(bar);
  const list = div("list");
  for (const it of items) {
    const row = div("li");
    row.append(div("li-marker", it.done ? "☑" : "☐"));
    const t = div("li-text", it.text);
    if (it.done) t.classList.add("li-done");
    row.appendChild(t);
    list.appendChild(row);
  }
  el.appendChild(list);
};

// ---- signage & office ----
const roomStatus: Render = (el, w) => {
  if (w.type !== "roomStatus") return;
  el.appendChild(div("widget-heading", w.props.room));
  const big = div("openbig", w.props.status.toUpperCase());
  big.classList.toggle("is-open", w.props.status === "free");
  el.appendChild(big);
};
const directory: Render = (el, w) => {
  if (w.type !== "directory") return;
  const list = div("kv");
  for (const [name, loc] of pipes(w.props.items)) {
    const row = div("kv-row");
    row.append(div("kv-key", name), div("kv-val", loc));
    list.appendChild(row);
  }
  el.appendChild(list);
};
const eventBanner: Render = (el, w) => {
  if (w.type !== "eventBanner") return;
  el.appendChild(div("event-title", w.props.title));
  el.appendChild(div("event-when", w.props.when));
};
const openSign: Render = (el, w) => {
  if (w.type !== "openSign") return;
  if (w.props.label) el.appendChild(div("widget-heading", w.props.label));
  const big = div("openbig", w.props.open ? "OPEN" : "CLOSED");
  big.classList.toggle("is-open", w.props.open);
  el.appendChild(big);
};
const nowPlaying: Render = (el, w) => {
  if (w.type !== "nowPlaying") return;
  el.appendChild(div("widget-heading", "♪ Now playing"));
  el.appendChild(div("np-title", w.props.title));
  el.appendChild(div("np-artist", w.props.artist));
};
const splitFlap: Render = (el, w) => {
  if (w.type !== "splitFlap") return;
  const wrap = div("splitflap");
  for (const ch of w.props.text.toUpperCase().slice(0, 16)) wrap.appendChild(div("flap", ch === " " ? " " : ch));
  el.appendChild(wrap);
};

// ================= v0.9 — 60 more (computed / prop, offline-safe) =================

const pctBar = (pct: number): HTMLDivElement => {
  const wrap = div("bar");
  const fill = div("bar-fill");
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  wrap.appendChild(fill);
  return wrap;
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOWFULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ---- text & structure ----
const epigraph: Render = (el, w) => {
  if (w.type !== "epigraph") return;
  el.appendChild(div("epigraph-text", w.props.content));
  if (w.props.author) el.appendChild(div("epigraph-by", `— ${w.props.author}`));
};
const kicker: Render = (el, w) => {
  if (w.type !== "kicker") return;
  el.appendChild(div("kicker-eyebrow", w.props.kicker));
  el.appendChild(div("kicker-title", w.props.title));
};
const ticker: Render = (el, w) => {
  if (w.type !== "ticker") return;
  el.appendChild(div("ticker", w.props.content));
};
const glossary: Render = (el, w) => {
  if (w.type !== "glossary") return;
  const list = div("kv");
  for (const [term, def] of pipes(w.props.items)) {
    const row = div("gloss-row");
    row.append(div("gloss-term", term), div("gloss-def", def));
    list.appendChild(row);
  }
  el.appendChild(list);
};
const footnotes: Render = (el, w) => {
  if (w.type !== "footnotes") return;
  const list = div("footnotes");
  lines(w.props.items).forEach((t, i) => {
    const row = div("fn-row");
    row.append(div("fn-num", `${i + 1}`), div("fn-text", t));
    list.appendChild(row);
  });
  el.appendChild(list);
};
const highlight: Render = (el, w) => {
  if (w.type !== "highlight") return;
  el.appendChild(div("highlight", w.props.content));
};
const letterhead: Render = (el, w) => {
  if (w.type !== "letterhead") return;
  el.appendChild(div("lh-name", w.props.name));
  el.appendChild(div("lh-tagline", w.props.tagline));
  el.appendChild(div("divider-rule"));
};
const fieldRow: Render = (el, w) => {
  if (w.type !== "fieldRow") return;
  el.appendChild(div("field-label", w.props.label));
  el.appendChild(div("field-value", w.props.value));
};
const contents: Render = (el, w) => {
  if (w.type !== "contents") return;
  const list = div("contents");
  lines(w.props.items).forEach((t, i) => {
    const row = div("toc-row");
    row.append(div("toc-text", t), div("toc-leader"), div("toc-num", `${i + 1}`));
    list.appendChild(row);
  });
  el.appendChild(list);
};
const aside: Render = (el, w) => {
  if (w.type !== "aside") return;
  el.appendChild(div("aside", w.props.content));
};
const postscript: Render = (el, w) => {
  if (w.type !== "postscript") return;
  const p = div("postscript");
  p.append(div("ps-mark", "P.S."), div("ps-text", w.props.content));
  el.appendChild(p);
};
const mantra: Render = (el, w) => {
  if (w.type !== "mantra") return;
  el.appendChild(div("mantra", w.props.content));
};

// ---- media & identity ----
const emojiStat: Render = (el, w) => {
  if (w.type !== "emojiStat") return;
  el.appendChild(div("emoji-stat", w.props.emoji));
  if (w.props.label) el.appendChild(div("stat-label", w.props.label));
};
const monogram: Render = (el, w) => {
  if (w.type !== "monogram") return;
  el.appendChild(div("monogram", w.props.letters.toUpperCase().slice(0, 3)));
  if (w.props.label) el.appendChild(div("stat-label", w.props.label));
};
const flag: Render = (el, w) => {
  if (w.type !== "flag") return;
  el.appendChild(div("flag-emoji", w.props.emoji));
  el.appendChild(div("flag-label", w.props.label));
};
const logoText: Render = (el, w) => {
  if (w.type !== "logoText") return;
  el.appendChild(div("logo-text", w.props.text));
};
const profileCard: Render = (el, w) => {
  if (w.type !== "profileCard") return;
  el.appendChild(div("pc-name", w.props.name));
  el.appendChild(div("pc-role", w.props.role));
  el.appendChild(div("pc-detail", w.props.detail));
};
const peopleList: Render = (el, w) => {
  if (w.type !== "peopleList") return;
  const list = div("kv");
  for (const [name, role] of pipes(w.props.items)) {
    const row = div("kv-row");
    row.append(div("kv-key", name), div("kv-val", role));
    list.appendChild(row);
  }
  el.appendChild(list);
};

// ---- numbers ----
const bigNumber: Render = (el, w, data) => {
  if (w.type !== "bigNumber") return;
  el.appendChild(div("stat-value", boundStr(w, data, "value")));
  if (w.props.caption) el.appendChild(div("stat-label", w.props.caption));
};
const percentBig: Render = (el, w, data) => {
  if (w.type !== "percentBig") return;
  if (w.props.label) heading2(el, w.props.label);
  const pct = boundNum(w, data, "value");
  el.appendChild(div("stat-value", `${Math.round(pct)}%`));
  el.appendChild(pctBar(pct));
};
const deltaStat: Render = (el, w, data) => {
  if (w.type !== "deltaStat") return;
  if (w.props.label) heading2(el, w.props.label);
  el.appendChild(div("stat-value", boundStr(w, data, "value")));
  const up = w.props.delta.trim().startsWith("-") ? "▾" : "▴";
  el.appendChild(div("delta", `${up} ${w.props.delta}`));
};
const moneyStat: Render = (el, w) => {
  if (w.type !== "moneyStat") return;
  if (w.props.label) heading2(el, w.props.label);
  const row = div("metric-row");
  row.append(div("money-cur", w.props.currency), div("stat-value", w.props.amount));
  el.appendChild(row);
};
const counterPair: Render = (el, w) => {
  if (w.type !== "counterPair") return;
  const wrap = div("counter-pair");
  [[w.props.leftValue, w.props.leftLabel], [w.props.rightValue, w.props.rightLabel]].forEach(([v, l]) => {
    const c = div("cp-cell");
    c.append(div("cp-value", v), div("cp-label", l));
    wrap.appendChild(c);
  });
  el.appendChild(wrap);
};
const targetMeter: Render = (el, w) => {
  if (w.type !== "targetMeter") return;
  if (w.props.label) heading2(el, w.props.label);
  el.appendChild(div("stat-value", `${w.props.value}${w.props.unit} / ${w.props.target}${w.props.unit}`));
  el.appendChild(pctBar((w.props.value / (w.props.target || 1)) * 100));
};
const unitStat: Render = (el, w) => {
  if (w.type !== "unitStat") return;
  if (w.props.label) heading2(el, w.props.label);
  const row = div("metric-row");
  row.append(div("metric-value", w.props.value), div("metric-unit", w.props.unit));
  el.appendChild(row);
};
const progressBars: Render = (el, w) => {
  if (w.type !== "progressBars") return;
  const list = div("progress-bars");
  for (const [label, val] of pipes(w.props.items)) {
    const row = div("pb-row");
    row.append(div("pb-label", label), pctBar(Number(val) || 0), div("pb-val", `${Number(val) || 0}%`));
    list.appendChild(row);
  }
  el.appendChild(list);
};

// ---- charts ----
const lollipopChart: Render = (el, w) => {
  if (w.type !== "lollipopChart") return;
  const data = pipes(w.props.items).map(([l, n]) => ({ l, n: Number(n) || 0 }));
  const max = Math.max(1, ...data.map((d) => d.n));
  const list = div("lollipop");
  for (const d of data) {
    const row = div("lp-row");
    const track = div("lp-track");
    const stick = div("lp-stick");
    stick.style.width = `${(d.n / max) * 100}%`;
    track.appendChild(stick);
    track.appendChild(div("lp-dot"));
    row.append(div("lp-label", d.l), track, div("lp-val", String(d.n)));
    list.appendChild(row);
  }
  el.appendChild(list);
};
const winLossBar: Render = (el, w, data) => {
  if (w.type !== "winLossBar") return;
  if (w.props.label) heading2(el, w.props.label);
  const wrap = div("winloss");
  boundNums(w, data).slice(0, 40).forEach((v) => {
    const cls = v > 0 ? " win" : v < 0 ? " loss" : " tie";
    wrap.appendChild(div(`wl-cell${cls}`));
  });
  el.appendChild(wrap);
};
const dotMatrix: Render = (el, w) => {
  if (w.type !== "dotMatrix") return;
  if (w.props.label) heading2(el, w.props.label);
  const grid = div("dotmatrix");
  for (let i = 0; i < w.props.total; i++) grid.appendChild(div(`dm-dot${i < w.props.value ? " on" : ""}`));
  el.appendChild(grid);
  el.appendChild(div("stat-label", `${w.props.value} / ${w.props.total}`));
};
const rangeBar: Render = (el, w) => {
  if (w.type !== "rangeBar") return;
  if (w.props.label) heading2(el, w.props.label);
  const pct = Math.max(0, Math.min(100, ((w.props.value - w.props.min) / ((w.props.max - w.props.min) || 1)) * 100));
  const track = div("rangebar");
  const dot = div("rb-dot");
  dot.style.left = `${pct}%`;
  track.appendChild(dot);
  el.appendChild(track);
  const ends = div("rb-ends");
  ends.append(div("rb-end", String(w.props.min)), div("rb-cur", String(w.props.value)), div("rb-end", String(w.props.max)));
  el.appendChild(ends);
};
const bubbleScale: Render = (el, w) => {
  if (w.type !== "bubbleScale") return;
  const data = pipes(w.props.items).map(([l, n]) => ({ l, n: Number(n) || 0 }));
  const max = Math.max(1, ...data.map((d) => d.n));
  const wrap = div("bubbles");
  for (const d of data) {
    const col = div("bb-col");
    const b = div("bb-circle");
    const size = 20 + (d.n / max) * 60;
    b.style.width = `${size}%`;
    b.style.paddingBottom = `${size}%`;
    col.append(b, div("bb-label", d.l));
    wrap.appendChild(col);
  }
  el.appendChild(wrap);
};
const starBar: Render = (el, w) => {
  if (w.type !== "starBar") return;
  if (w.props.label) heading2(el, w.props.label);
  const row = div("starbar");
  const n = Math.round(w.props.value);
  for (let i = 0; i < w.props.max; i++) row.appendChild(div("sb-star", i < n ? "★" : "☆"));
  el.appendChild(row);
};
const columnLabels: Render = (el, w) => {
  if (w.type !== "columnLabels") return;
  const data = pipes(w.props.items).map(([l, n]) => ({ l, n: Number(n) || 0 }));
  const max = Math.max(1, ...data.map((d) => d.n));
  const wrap = div("collabels");
  for (const d of data) {
    const col = div("cl-col");
    const b = div("cl-bar");
    b.style.height = `${(d.n / max) * 100}%`;
    const stack = div("cl-stack");
    stack.appendChild(b);
    col.append(div("cl-val", String(d.n)), stack, div("cl-label", d.l));
    wrap.appendChild(col);
  }
  el.appendChild(wrap);
};
const deltaList: Render = (el, w) => {
  if (w.type !== "deltaList") return;
  const list = div("kv");
  for (const [label, d] of pipes(w.props.items)) {
    const row = div("kv-row");
    const down = d.trim().startsWith("-");
    const val = div("kv-val", `${down ? "▾" : "▴"} ${d}`);
    val.classList.add(down ? "is-down" : "is-up");
    row.append(div("kv-key", label), val);
    list.appendChild(row);
  }
  el.appendChild(list);
};
const gaugeMini: Render = (el, w) => {
  if (w.type !== "gaugeMini") return;
  if (w.props.label) heading2(el, w.props.label);
  const ring = div("ring");
  ring.innerHTML = ringSvg(w.props.value);
  ring.appendChild(div("ring-label", `${Math.round(w.props.value)}%`));
  el.appendChild(ring);
};
const histogram: Render = (el, w, data) => {
  if (w.type !== "histogram") return;
  if (w.props.label) heading2(el, w.props.label);
  const sp = div("spark");
  sp.innerHTML = barSvg(boundNums(w, data));
  el.appendChild(sp);
};

// ---- time computed ----
const fullDate: Render = (el, w) => {
  if (w.type !== "fullDate") return;
  if (w.props.label) heading2(el, w.props.label);
  const weekday = div("fd-weekday");
  const date = div("fd-date");
  el.append(weekday, date);
  return every(30_000, () => {
    const now = new Date();
    weekday.textContent = DOWFULL[now.getDay()];
    date.textContent = now.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
  });
};
const monthName: Render = (el, w) => {
  if (w.type !== "monthName") return;
  if (w.props.label) heading2(el, w.props.label);
  const big = div("month-name");
  el.appendChild(big);
  return every(60_000, () => { big.textContent = MONTHS[new Date().getMonth()]; });
};
const timeOfDay: Render = (el, w) => {
  if (w.type !== "timeOfDay") return;
  if (w.props.label) heading2(el, w.props.label);
  const big = div("stat-value");
  el.appendChild(big);
  return every(60_000, () => {
    const h = new Date().getHours();
    big.textContent = h < 5 ? "Night" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 21 ? "Evening" : "Night";
  });
};
const quarterProgress: Render = (el, w) => {
  if (w.type !== "quarterProgress") return;
  if (w.props.label) heading2(el, w.props.label);
  const label = div("stat-label");
  const b = pctBar(0);
  el.append(b, label);
  return every(60_000, () => {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1).getTime();
    const end = new Date(now.getFullYear(), q * 3 + 3, 1).getTime();
    const pct = ((now.getTime() - start) / (end - start)) * 100;
    (b.firstChild as HTMLElement).style.width = `${pct}%`;
    label.textContent = `Q${q + 1} · ${Math.round(pct)}%`;
  });
};
const daysLeftMonth: Render = (el, w) => {
  if (w.type !== "daysLeftMonth") return;
  if (w.props.label) heading2(el, w.props.label);
  const big = div("stat-value");
  const sub = div("stat-label");
  el.append(big, sub);
  return every(60_000, () => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    big.textContent = String(last - now.getDate());
    sub.textContent = "days left this month";
  });
};
const unixClock: Render = (el, w) => {
  if (w.type !== "unixClock") return;
  if (w.props.label) heading2(el, w.props.label);
  const big = div("unix");
  el.appendChild(big);
  return every(1000, () => { big.textContent = String(Math.floor(Date.now() / 1000)); });
};
const tzPair: Render = (el, w) => {
  if (w.type !== "tzPair") return;
  const wrap = div("tzpair");
  const a = div("tz-time");
  const b = div("tz-time");
  const cellA = div("tz-cell");
  cellA.append(div("tz-label", w.props.labelA), a);
  const cellB = div("tz-cell");
  cellB.append(div("tz-label", w.props.labelB), b);
  wrap.append(cellA, cellB);
  el.appendChild(wrap);
  return every(1000, () => {
    const now = new Date();
    a.textContent = fmtTime(now, { hour: "2-digit", minute: "2-digit", timeZone: w.props.tzA });
    b.textContent = fmtTime(now, { hour: "2-digit", minute: "2-digit", timeZone: w.props.tzB });
  });
};
const nextWeekday: Render = (el, w) => {
  if (w.type !== "nextWeekday") return;
  if (w.props.label) heading2(el, w.props.label);
  const big = div("countdown-value");
  const sub = div("stat-label");
  el.append(big, sub);
  return every(60_000, () => {
    const now = new Date();
    const today = now.getDay();
    let delta = (w.props.weekday - today + 7) % 7;
    if (delta === 0) delta = 7;
    big.textContent = delta === 1 ? "Tomorrow" : `in ${delta} days`;
    sub.textContent = DOWFULL[w.props.weekday];
  });
};

// ---- nature computed ----
const fmtDur = (ms: number): string => {
  const m = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const daylight: Render = (el, w) => {
  if (w.type !== "daylight") return;
  if (w.props.label) heading2(el, w.props.label);
  const t = sunTimes(new Date(), w.props.latitude, w.props.longitude);
  if (!t) return placeholder(el, "no daylight data");
  el.appendChild(div("stat-value", fmtDur(t.sunset.getTime() - t.sunrise.getTime())));
  el.appendChild(div("stat-label", "of daylight"));
};
const moonProgress: Render = (el, w) => {
  if (w.type !== "moonProgress") return;
  if (w.props.label) heading2(el, w.props.label);
  const m = moonPhase(new Date());
  const row = div("metric-row");
  row.append(div("moon-emoji", m.emoji), div("stat-value", `${m.illumination}%`));
  el.appendChild(row);
  el.appendChild(div("stat-label", m.name));
};
const seasonProgress: Render = (el, w) => {
  if (w.type !== "seasonProgress") return;
  if (w.props.label) heading2(el, w.props.label);
  const now = new Date();
  const s = seasonOf(now.getMonth(), w.props.hemisphere);
  // season starts roughly on the 21st of Mar/Jun/Sep/Dec
  const doy = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000);
  const pct = Math.round((((doy + 10) % 91.3) / 91.3) * 100);
  const row = div("metric-row");
  row.append(div("moon-emoji", s.emoji), div("stat-value", s.name));
  el.appendChild(row);
  el.appendChild(pctBar(pct));
};
const goldenHour: Render = (el, w) => {
  if (w.type !== "goldenHour") return;
  if (w.props.label) heading2(el, w.props.label);
  const t = sunTimes(new Date(), w.props.latitude, w.props.longitude);
  if (!t) return placeholder(el, "no sun data");
  const am = new Date(t.sunrise.getTime() + 3_600_000);
  const pm = new Date(t.sunset.getTime() - 3_600_000);
  const list = div("kv");
  [["Morning", t.sunrise, am], ["Evening", pm, t.sunset]].forEach(([lbl, a, b]) => {
    const row = div("kv-row");
    row.append(div("kv-key", lbl as string), div("kv-val", `${fmtTime(a as Date, { hour: "2-digit", minute: "2-digit" })}–${fmtTime(b as Date, { hour: "2-digit", minute: "2-digit" })}`));
    list.appendChild(row);
  });
  el.appendChild(list);
};

// ---- trackers ----
const goalProgress: Render = (el, w) => {
  if (w.type !== "goalProgress") return;
  if (w.props.label) heading2(el, w.props.label);
  el.appendChild(div("stat-value", `${w.props.value}${w.props.unit} / ${w.props.target}${w.props.unit}`));
  el.appendChild(pctBar((w.props.value / (w.props.target || 1)) * 100));
};
const stepsToday: Render = (el, w) => {
  if (w.type !== "stepsToday") return;
  heading2(el, w.props.label);
  el.appendChild(div("stat-value", w.props.value.toLocaleString()));
  el.appendChild(pctBar((w.props.value / (w.props.goal || 1)) * 100));
  el.appendChild(div("stat-label", `goal ${w.props.goal.toLocaleString()}`));
};
const streakPair: Render = (el, w) => {
  if (w.type !== "streakPair") return;
  if (w.props.label) heading2(el, w.props.label);
  const wrap = div("counter-pair");
  [[String(w.props.current), "current"], [String(w.props.best), "best"]].forEach(([v, l]) => {
    const c = div("cp-cell");
    c.append(div("cp-value", v), div("cp-label", l));
    wrap.appendChild(c);
  });
  el.appendChild(wrap);
};
const bookList: Render = (el, w) => {
  if (w.type !== "bookList") return;
  const list = div("kv");
  for (const [title, author] of pipes(w.props.items)) {
    const row = div("book-row");
    row.append(div("book-title", title), div("book-author", author));
    list.appendChild(row);
  }
  el.appendChild(list);
};
const moodToday: Render = (el, w) => {
  if (w.type !== "moodToday") return;
  el.appendChild(div("mood-big", w.props.emoji));
  if (w.props.label) el.appendChild(div("stat-label", w.props.label));
};
const budgetLine: Render = (el, w) => {
  if (w.type !== "budgetLine") return;
  if (w.props.label) heading2(el, w.props.label);
  const left = w.props.budget - w.props.spent;
  el.appendChild(div("stat-value", `${w.props.unit}${left.toLocaleString()}`));
  el.appendChild(div("stat-label", "left"));
  el.appendChild(pctBar((w.props.spent / (w.props.budget || 1)) * 100));
};

// ---- info & signage ----
const welcomeSign: Render = (el, w) => {
  if (w.type !== "welcomeSign") return;
  el.appendChild(div("welcome-msg", w.props.message));
  el.appendChild(div("welcome-name", w.props.name));
};
const priceTag: Render = (el, w) => {
  if (w.type !== "priceTag") return;
  el.appendChild(div("pt-item", w.props.item));
  const row = div("metric-row");
  row.append(div("pt-unit", w.props.unit), div("pt-price", w.props.price));
  el.appendChild(row);
};
const todaySpecial: Render = (el, w) => {
  if (w.type !== "todaySpecial") return;
  el.appendChild(div("ts-title", w.props.title));
  el.appendChild(div("ts-detail", w.props.detail));
};
const phoneNumber: Render = (el, w) => {
  if (w.type !== "phoneNumber") return;
  if (w.props.label) heading2(el, w.props.label);
  el.appendChild(div("phone", w.props.number));
};
const socialHandle: Render = (el, w) => {
  if (w.type !== "socialHandle") return;
  el.appendChild(div("social-platform", w.props.platform));
  el.appendChild(div("social-handle", w.props.handle));
};
const wayfinding: Render = (el, w) => {
  if (w.type !== "wayfinding") return;
  const list = div("kv");
  for (const [place, dir] of pipes(w.props.items)) {
    const row = div("kv-row");
    row.append(div("kv-key", place), div("wf-dir", dir));
    list.appendChild(row);
  }
  el.appendChild(list);
};

export const WIDGETS: Record<WidgetT["type"], Render> = {
  clock, weather, calendar, tasks, text, queue, heading, divider, image, callout,
  subheading, quote, bulletList, numberedList, checklist, code, label, keyValue, table,
  link, banner, definition, spacer, stat, metric, progress, rating, gauge, worldClock,
  countdown, daysUntil, weekNumber, dateBadge, timer, analogClock, moonPhase: moonPhaseR,
  sunriseSunset, icon, avatar, badge, nameTag, hours, menuList, deviceStatus, sensor, thermostat,
  lead, pullquote, dropCap, finePrint, numberedHeading, verse, ascii, tagCloud, timeline, steps,
  faq, prosCons, sparkline, barChart, progressRing, dotProgress, scoreboard, fraction, tally,
  heatStrip, trend, kpiSpark, dayProgress, yearProgress, weekProgress, greeting, romanClock,
  binaryClock, seasonClock, zodiac, habitTracker, streak, waterTracker, wifiCard, forecast,
  windCompass, uvIndex, airQuality, precip, headlines, currencyRate, cryptoPrice, onThisDay,
  wikiToday, quoteLive, factLive, hackerNews, githubStats, nextHoliday, issNow, jsonFeed,
  signature, address, byline, legend, breadcrumb, noticeBar, keyCombo, dividerLabeled,
  iconRow, statRow, spacerDots, frame, lineChart, areaChart, bulletGraph, horizontalBars,
  rankingList, waffle, signalBars, thermometer, comparison, percentList, monthCalendar,
  weekStrip, nowNext, ageCounter, anniversary, timeBlocks, shiftStatus, pomodoro, monthHabit,
  savingsGoal, readingNow, weightTrend, moodWeek, checklistProgress, roomStatus, directory,
  eventBanner, openSign, nowPlaying, splitFlap,
  // v0.9
  epigraph, kicker, ticker, glossary, footnotes, highlight, letterhead, fieldRow, contents,
  aside, postscript, mantra, emojiStat, monogram, flag, logoText, profileCard, peopleList,
  bigNumber, percentBig, deltaStat, moneyStat, counterPair, targetMeter, unitStat, progressBars,
  lollipopChart, winLossBar, dotMatrix, rangeBar, bubbleScale, starBar, columnLabels, deltaList,
  gaugeMini, histogram, fullDate, monthName, timeOfDay, quarterProgress, daysLeftMonth, unixClock,
  tzPair, nextWeekday, daylight, moonProgress, seasonProgress, goldenHour, goalProgress, stepsToday,
  streakPair, bookList, moodToday, budgetLine, welcomeSign, priceTag, todaySpecial, phoneNumber,
  socialHandle, wayfinding,
};
