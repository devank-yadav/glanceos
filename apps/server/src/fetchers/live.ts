import type {
  CryptoDataT, CurrencyDataT, FactDataT, GithubDataT, HeadlinesDataT, HolidayDataT,
  IssDataT, OnThisDayDataT, QuoteLiveDataT, WikiDataT,
} from "@glanceos/schema";
import { cached, FAIL, getJSON, getText, TTL } from "./cache";

// The remaining keyless live sources: feeds, reference, finance. Each returns
// null on failure; the screen renders a one-line placeholder.

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .trim();
}

// Pull <title> out of each <item>/<entry> (RSS or Atom), skipping the channel title.
export function headlinesData(p: { url: string; max: number }): Promise<HeadlinesDataT | null> {
  return cached(`rss:${p.url}:${p.max}`, TTL.m10, FAIL, async () => {
    const xml = await getText(p.url, { accept: "application/rss+xml, application/xml, text/xml, */*" });
    const items: string[] = [];
    const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/g) ?? [];
    for (const block of blocks) {
      const m = block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/);
      if (m) {
        const t = decodeEntities(m[1]!);
        if (t) items.push(t);
      }
      if (items.length >= p.max) break;
    }
    return { items };
  });
}

export function hackerNewsData(p: { max: number }): Promise<HeadlinesDataT | null> {
  return cached(`hn:${p.max}`, TTL.m15, FAIL, async () => {
    const ids = await getJSON<number[]>("https://hacker-news.firebaseio.com/v0/topstories.json");
    const top = await Promise.all(
      ids.slice(0, p.max).map((id) => getJSON<{ title: string }>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null)),
    );
    return { items: top.filter(Boolean).map((s) => s!.title) };
  });
}

export function currencyData(p: { from: string; to: string }): Promise<CurrencyDataT | null> {
  const from = p.from.toUpperCase();
  const to = p.to.toUpperCase();
  return cached(`fx:${from}:${to}`, TTL.m30, FAIL, async () => {
    const j = await getJSON<{ date: string; rates: Record<string, number> }>(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
    const rate = j.rates[to];
    if (rate === undefined) return null;
    return { from, to, rate, date: j.date };
  });
}

export function cryptoData(p: { coin: string; vs: string }): Promise<CryptoDataT | null> {
  const coin = p.coin.toLowerCase();
  const vs = p.vs.toLowerCase();
  return cached(`crypto:${coin}:${vs}`, TTL.m5, FAIL, async () => {
    const j = await getJSON<Record<string, Record<string, number>>>(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=${vs}&include_24hr_change=true`,
    );
    const row = j[coin];
    if (!row || row[vs] === undefined) return null;
    return { coin, vs, price: row[vs]!, change: row[`${vs}_24h_change`] };
  });
}

export function onThisDayData(p: { max: number }, now: Date): Promise<OnThisDayDataT | null> {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return cached(`otd:${mm}/${dd}:${p.max}`, TTL.h6, FAIL, async () => {
    const j = await getJSON<{ events: Array<{ year: number; text: string }> }>(
      `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`,
    );
    return { items: j.events.slice(-p.max).reverse().map((e) => ({ year: e.year, text: e.text })) };
  });
}

export function wikiData(p: { title: string }): Promise<WikiDataT | null> {
  const path = p.title.trim() ? `summary/${encodeURIComponent(p.title.trim().replace(/\s+/g, "_"))}` : "random/summary";
  return cached(`wiki:${p.title.trim() || "random"}`, TTL.h6, FAIL, async () => {
    const j = await getJSON<{ title: string; extract: string }>(`https://en.wikipedia.org/api/rest_v1/page/${path}`);
    return { title: j.title, extract: j.extract };
  });
}

export function quoteData(): Promise<QuoteLiveDataT | null> {
  return cached("quote", TTL.h6, FAIL, async () => {
    const j = await getJSON<Array<{ q: string; a: string }>>("https://zenquotes.io/api/today");
    const q = j[0];
    return q ? { text: q.q, author: q.a } : null;
  });
}

export function factData(): Promise<FactDataT | null> {
  return cached("fact", TTL.h6, FAIL, async () => {
    const j = await getJSON<{ text: string }>("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en");
    return { text: j.text };
  });
}

export function githubData(p: { user: string; repo: string }): Promise<GithubDataT | null> {
  const repo = p.repo.trim();
  return cached(`gh:${p.user}/${repo}`, TTL.h1, FAIL, async () => {
    if (repo) {
      const j = await getJSON<{ full_name: string; stargazers_count: number }>(`https://api.github.com/repos/${p.user}/${repo}`);
      return { name: j.full_name, metric: "stars", value: j.stargazers_count };
    }
    const j = await getJSON<{ login: string; followers: number }>(`https://api.github.com/users/${p.user}`);
    return { name: j.login, metric: "followers", value: j.followers };
  });
}

export function holidayData(p: { country: string }, now: Date): Promise<HolidayDataT | null> {
  const cc = p.country.toUpperCase();
  return cached(`holiday:${cc}`, TTL.h12, FAIL, async () => {
    const j = await getJSON<Array<{ date: string; localName: string; name: string }>>(`https://date.nager.at/api/v3/NextPublicHolidays/${cc}`);
    const next = j[0];
    if (!next) return null;
    const days = Math.round((new Date(next.date).getTime() - new Date(now.toDateString()).getTime()) / 86_400_000);
    return { name: next.localName || next.name, date: next.date, daysUntil: days };
  });
}

export function issData(): Promise<IssDataT | null> {
  return cached("iss", TTL.min, FAIL, async () => {
    const j = await getJSON<{ iss_position: { latitude: string; longitude: string } }>("http://api.open-notify.org/iss-now.json");
    return { latitude: Math.round(+j.iss_position.latitude * 10) / 10, longitude: Math.round(+j.iss_position.longitude * 10) / 10 };
  });
}
