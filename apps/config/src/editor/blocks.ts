import type { WidgetT } from "@glanceos/schema";

// The single registry the palette, slash menu, and insert logic read.
// defaultH = the height (units /24) a new block's line gets, so adding a block
// never fills the screen.

export type WidgetType = WidgetT["type"];
export type BlockCategory = "Text" | "Media" | "Numbers" | "Charts" | "Time" | "Nature" | "Trackers" | "Info" | "Live" | "Smart home";

export interface BlockDef {
  type: WidgetType;
  label: string;
  glyph: string;
  description: string;
  keywords: string;
  category: BlockCategory;
  defaultH: number;
  defaultProps: Record<string, unknown>;
}

export const BLOCKS: BlockDef[] = [
  // Text
  { type: "text", label: "Text", glyph: "T", category: "Text", defaultH: 3, description: "Plain paragraph", keywords: "paragraph note plain write", defaultProps: { content: "Write something calm.", align: "left" } },
  { type: "heading", label: "Heading", glyph: "H", category: "Text", defaultH: 3, description: "Large section title", keywords: "title h1 h2", defaultProps: { content: "Heading", level: 1 } },
  { type: "subheading", label: "Subheading", glyph: "h", category: "Text", defaultH: 3, description: "Smaller title", keywords: "title h3 subtitle", defaultProps: { content: "Subheading" } },
  { type: "label", label: "Label", glyph: "¶", category: "Text", defaultH: 2, description: "Small uppercase eyebrow", keywords: "eyebrow caption tag", defaultProps: { content: "LABEL" } },
  { type: "quote", label: "Quote", glyph: "❝", category: "Text", defaultH: 4, description: "A pull quote", keywords: "blockquote citation", defaultProps: { content: "A calm quote.", author: "" } },
  { type: "callout", label: "Callout", glyph: "✸", category: "Text", defaultH: 4, description: "Emphasized note with emoji", keywords: "note highlight box", defaultProps: { content: "Something worth noticing.", emoji: "💡" } },
  { type: "banner", label: "Banner", glyph: "▭", category: "Text", defaultH: 3, description: "Full-width announcement", keywords: "announcement title big", defaultProps: { content: "Announcement" } },
  { type: "bulletList", label: "Bullet list", glyph: "•", category: "Text", defaultH: 5, description: "Unordered list", keywords: "list ul items", defaultProps: { items: "First item\nSecond item\nThird item" } },
  { type: "numberedList", label: "Numbered list", glyph: "1.", category: "Text", defaultH: 5, description: "Ordered list", keywords: "list ol steps", defaultProps: { items: "First\nSecond\nThird" } },
  { type: "checklist", label: "Checklist", glyph: "☑", category: "Text", defaultH: 5, description: "Static checkbox list", keywords: "todo tasks check", defaultProps: { items: "x Done already\nStill to do\nAnd this" } },
  { type: "code", label: "Code", glyph: "</>", category: "Text", defaultH: 4, description: "Monospace block", keywords: "code mono pre", defaultProps: { content: "echo hello", language: "" } },
  { type: "keyValue", label: "Key / value", glyph: "≔", category: "Text", defaultH: 5, description: "Label–value pairs", keywords: "facts details spec", defaultProps: { pairs: "Status: Open\nRoom: 3" } },
  { type: "table", label: "Table", glyph: "▦", category: "Text", defaultH: 6, description: "Rows and columns", keywords: "grid data", defaultProps: { content: "Name, Status\nDoor, Locked\nLights, On", header: true } },
  { type: "definition", label: "Definition", glyph: "𝐃", category: "Text", defaultH: 4, description: "Term and meaning", keywords: "word glossary", defaultProps: { term: "Word", meaning: "Its meaning." } },
  { type: "divider", label: "Divider", glyph: "—", category: "Text", defaultH: 1, description: "Horizontal rule", keywords: "rule line separator hr", defaultProps: {} },
  { type: "spacer", label: "Spacer", glyph: "␣", category: "Text", defaultH: 2, description: "Empty breathing room", keywords: "gap blank space", defaultProps: {} },

  // Media & identity
  { type: "image", label: "Image", glyph: "▣", category: "Media", defaultH: 7, description: "Picture from a URL", keywords: "photo picture media", defaultProps: { url: "https://picsum.photos/800/600?grayscale", fit: "cover" } },
  { type: "icon", label: "Icon", glyph: "★", category: "Media", defaultH: 5, description: "A big symbol or emoji", keywords: "symbol emoji glyph", defaultProps: { symbol: "★", label: "" } },
  { type: "avatar", label: "Avatar", glyph: "☻", category: "Media", defaultH: 5, description: "Photo, name and role", keywords: "person profile face", defaultProps: { url: "https://i.pravatar.cc/200", name: "Name", role: "" } },
  { type: "badge", label: "Badge", glyph: "◖", category: "Media", defaultH: 2, description: "A small pill", keywords: "tag chip status", defaultProps: { text: "Badge" } },
  { type: "nameTag", label: "Name tag", glyph: "🪪", category: "Media", defaultH: 4, description: "Large name and subtitle", keywords: "desk identity title", defaultProps: { name: "Your Name", subtitle: "" } },
  { type: "link", label: "Link", glyph: "↗", category: "Media", defaultH: 3, description: "A prominent URL", keywords: "url website href", defaultProps: { label: "Open", url: "https://example.com" } },

  // Numbers
  { type: "stat", label: "Stat", glyph: "№", category: "Numbers", defaultH: 5, description: "Big number and label", keywords: "kpi number metric count", defaultProps: { value: "0", label: "Label" } },
  { type: "metric", label: "Metric", glyph: "±", category: "Numbers", defaultH: 5, description: "Value, unit and delta", keywords: "kpi change trend", defaultProps: { label: "Metric", value: "0", unit: "", delta: "" } },
  { type: "progress", label: "Progress", glyph: "▰", category: "Numbers", defaultH: 3, description: "A progress bar", keywords: "percent bar completion", defaultProps: { label: "", value: 50 } },
  { type: "gauge", label: "Gauge", glyph: "◔", category: "Numbers", defaultH: 6, description: "A ring gauge", keywords: "percent ring dial", defaultProps: { label: "", value: 70 } },
  { type: "rating", label: "Rating", glyph: "✦", category: "Numbers", defaultH: 3, description: "Stars out of five", keywords: "stars score review", defaultProps: { value: 4, label: "" } },

  // Time
  { type: "clock", label: "Clock", glyph: "◷", category: "Time", defaultH: 4, description: "Time and date", keywords: "time date now", defaultProps: { showDate: true } },
  { type: "worldClock", label: "World clock", glyph: "🌐", category: "Time", defaultH: 4, description: "Time in a timezone", keywords: "timezone city utc", defaultProps: { label: "London", timeZone: "Europe/London" } },
  { type: "analogClock", label: "Analog clock", glyph: "◴", category: "Time", defaultH: 7, description: "Clock with hands", keywords: "time round dial", defaultProps: { label: "" } },
  { type: "countdown", label: "Countdown", glyph: "⏳", category: "Time", defaultH: 4, description: "Time to a moment", keywords: "timer until deadline", defaultProps: { label: "Countdown", target: "2027-01-01T00:00:00" } },
  { type: "daysUntil", label: "Days until", glyph: "⌛", category: "Time", defaultH: 4, description: "Days to a date", keywords: "until event date", defaultProps: { label: "New Year", target: "2027-01-01" } },
  { type: "timer", label: "Days since", glyph: "⏱", category: "Time", defaultH: 5, description: "Days since a date", keywords: "since streak counter", defaultProps: { label: "Days since", since: "2026-01-01" } },
  { type: "dateBadge", label: "Date badge", glyph: "▤", category: "Time", defaultH: 6, description: "Calendar-tile date", keywords: "today day month", defaultProps: { label: "" } },
  { type: "weekNumber", label: "Week number", glyph: "W", category: "Time", defaultH: 4, description: "ISO week of the year", keywords: "week iso", defaultProps: { label: "Week" } },

  // Nature
  { type: "weather", label: "Weather", glyph: "☼", category: "Nature", defaultH: 5, description: "Current conditions", keywords: "temperature forecast sun rain", defaultProps: { latitude: 28.6139, longitude: 77.209, label: "" } },
  { type: "moonPhase", label: "Moon phase", glyph: "☾", category: "Nature", defaultH: 6, description: "Tonight's moon", keywords: "lunar moon", defaultProps: { label: "" } },
  { type: "sunriseSunset", label: "Sun times", glyph: "☀", category: "Nature", defaultH: 5, description: "Sunrise and sunset", keywords: "sunrise sunset dawn dusk", defaultProps: { latitude: 28.6139, longitude: 77.209, label: "" } },

  // Info
  { type: "calendar", label: "Calendar", glyph: "🗓", category: "Info", defaultH: 8, description: "Upcoming ICS events", keywords: "agenda events ics schedule", defaultProps: { source: "ics", url: "https://example.com/calendar.ics", maxEvents: 5 } },
  { type: "tasks", label: "To-do list", glyph: "✔", category: "Info", defaultH: 6, description: "Open items from a list", keywords: "todo tasks checklist", defaultProps: { listId: "default", maxItems: 7 } },
  { type: "queue", label: "Queue board", glyph: "⊟", category: "Info", defaultH: 8, description: "Now-serving counter", keywords: "clinic serving number waiting", defaultProps: { queueId: "default", title: "Now serving" } },
  { type: "hours", label: "Opening hours", glyph: "◷", category: "Info", defaultH: 6, description: "Days and times", keywords: "hours schedule open", defaultProps: { content: "Mon–Fri: 9–5\nSat: 10–2\nSun: closed" } },
  { type: "menuList", label: "Menu", glyph: "≡", category: "Info", defaultH: 6, description: "Items and prices", keywords: "cafe price list menu", defaultProps: { content: "Espresso | 120\nLatte | 150\nCold brew | 180" } },

  // Smart home
  { type: "deviceStatus", label: "Device status", glyph: "◉", category: "Smart home", defaultH: 4, description: "On/off indicator", keywords: "light switch home assistant", defaultProps: { label: "Living room", state: "off" } },
  { type: "sensor", label: "Sensor", glyph: "∿", category: "Smart home", defaultH: 4, description: "A sensor reading", keywords: "humidity temperature value home", defaultProps: { label: "Humidity", value: "48", unit: "%" } },
  { type: "thermostat", label: "Thermostat", glyph: "🌡", category: "Smart home", defaultH: 4, description: "A temperature", keywords: "thermostat climate home", defaultProps: { label: "Thermostat", temperature: 22, unit: "C" } },

  // ===== v0.6 — text & structure =====
  { type: "lead", label: "Lead", glyph: "¶", category: "Text", defaultH: 4, description: "Large intro paragraph", keywords: "intro lede summary", defaultProps: { content: "A larger introduction that sets the tone." } },
  { type: "pullquote", label: "Pull quote", glyph: "❞", category: "Text", defaultH: 5, description: "Big emphasized quote", keywords: "quote highlight", defaultProps: { content: "The quiet thing, said loudly.", author: "" } },
  { type: "dropCap", label: "Drop cap", glyph: "Ꭺ", category: "Text", defaultH: 6, description: "Paragraph with a large initial", keywords: "paragraph story prose", defaultProps: { content: "Once upon a calm morning, the screen showed only what mattered, and nothing more." } },
  { type: "finePrint", label: "Fine print", glyph: "ⁿ", category: "Text", defaultH: 2, description: "Small footnote text", keywords: "footnote legal small", defaultProps: { content: "Terms apply. Prices include tax." } },
  { type: "numberedHeading", label: "Numbered heading", glyph: "№", category: "Text", defaultH: 3, description: "Number + title", keywords: "section step numbered", defaultProps: { number: "01", content: "Section title" } },
  { type: "verse", label: "Verse", glyph: "♪", category: "Text", defaultH: 5, description: "Centered stanza", keywords: "poem lyrics stanza", defaultProps: { content: "first line\nsecond line\nthird line" } },
  { type: "ascii", label: "ASCII art", glyph: "⌨", category: "Text", defaultH: 5, description: "Monospace art", keywords: "ascii mono art", defaultProps: { content: "  /\\_/\\\n ( o.o )\n  > ^ <" } },
  { type: "tagCloud", label: "Tags", glyph: "#", category: "Text", defaultH: 4, description: "A row of tags", keywords: "tags chips keywords", defaultProps: { tags: "calm, glance, minimal, quiet, focus" } },
  { type: "timeline", label: "Timeline", glyph: "┊", category: "Text", defaultH: 6, description: "Time-stamped events", keywords: "schedule agenda events", defaultProps: { items: "09:00 | Standup\n12:30 | Lunch\n16:00 | Review" } },
  { type: "steps", label: "Steps", glyph: "⟫", category: "Text", defaultH: 6, description: "Numbered steps", keywords: "how-to guide numbered", defaultProps: { items: "Plug in the screen\nConnect to Wi-Fi\nClaim with the code" } },
  { type: "faq", label: "FAQ", glyph: "?", category: "Text", defaultH: 6, description: "Question & answer pairs", keywords: "faq questions help", defaultProps: { items: "Is it free? | Yes, MIT licensed.\nNeed an account? | One per install." } },
  { type: "prosCons", label: "Pros / cons", glyph: "⊕", category: "Text", defaultH: 6, description: "Two-column list", keywords: "pros cons compare", defaultProps: { pros: "Quiet\nFast\nYours", cons: "No color\nNo apps" } },

  // ===== v0.6 — charts =====
  { type: "sparkline", label: "Sparkline", glyph: "∿", category: "Charts", defaultH: 5, description: "Tiny line chart", keywords: "line trend chart graph", defaultProps: { values: "3,5,4,6,7,6,8,7,9", label: "" } },
  { type: "barChart", label: "Bar chart", glyph: "▁", category: "Charts", defaultH: 6, description: "Mini vertical bars", keywords: "bars chart graph", defaultProps: { values: "4,8,6,10,7,9", label: "" } },
  { type: "progressRing", label: "Progress ring", glyph: "◍", category: "Charts", defaultH: 6, description: "Circular percent", keywords: "ring percent circle", defaultProps: { value: 64, label: "" } },
  { type: "dotProgress", label: "Dot progress", glyph: "⣿", category: "Charts", defaultH: 4, description: "Filled dots out of N", keywords: "progress dots count", defaultProps: { value: 7, total: 10, label: "" } },
  { type: "scoreboard", label: "Scoreboard", glyph: "⚀", category: "Charts", defaultH: 6, description: "Two scores", keywords: "score match versus game", defaultProps: { leftLabel: "Home", leftScore: "2", rightLabel: "Away", rightScore: "1" } },
  { type: "fraction", label: "Fraction", glyph: "½", category: "Charts", defaultH: 6, description: "Numerator over denominator", keywords: "fraction ratio out of", defaultProps: { numerator: "3", denominator: "10", label: "" } },
  { type: "tally", label: "Tally", glyph: "≣", category: "Charts", defaultH: 4, description: "Tally marks", keywords: "count tally marks", defaultProps: { value: 12, label: "" } },
  { type: "heatStrip", label: "Heat strip", glyph: "▦", category: "Charts", defaultH: 4, description: "Intensity cells", keywords: "heatmap intensity activity", defaultProps: { values: "0,1,2,3,2,4,1,0,3,4,2,1", label: "" } },
  { type: "trend", label: "Trend", glyph: "↗", category: "Charts", defaultH: 5, description: "Value with a delta", keywords: "trend change delta kpi", defaultProps: { value: "1,284", delta: "+12%", label: "Visitors" } },
  { type: "kpiSpark", label: "KPI + spark", glyph: "⌁", category: "Charts", defaultH: 6, description: "Value over a sparkline", keywords: "kpi metric sparkline", defaultProps: { value: "92", unit: "%", label: "Uptime", values: "88,90,89,93,92" } },

  // ===== v0.6 — time computed =====
  { type: "dayProgress", label: "Day progress", glyph: "◐", category: "Time", defaultH: 3, description: "Percent of day elapsed", keywords: "day progress percent", defaultProps: { label: "Day" } },
  { type: "yearProgress", label: "Year progress", glyph: "◓", category: "Time", defaultH: 3, description: "Percent of year elapsed", keywords: "year progress percent", defaultProps: { label: "Year" } },
  { type: "weekProgress", label: "Week progress", glyph: "◑", category: "Time", defaultH: 3, description: "Percent of week elapsed", keywords: "week progress percent", defaultProps: { label: "Week" } },
  { type: "greeting", label: "Greeting", glyph: "☺", category: "Time", defaultH: 4, description: "Good morning / evening", keywords: "greeting hello welcome", defaultProps: { name: "" } },
  { type: "romanClock", label: "Roman clock", glyph: "Ⅻ", category: "Time", defaultH: 5, description: "Time in Roman numerals", keywords: "roman clock time", defaultProps: { label: "" } },
  { type: "binaryClock", label: "Binary clock", glyph: "⊚", category: "Time", defaultH: 6, description: "Time as binary dots", keywords: "binary clock time geek", defaultProps: { label: "" } },
  { type: "seasonClock", label: "Season", glyph: "❄", category: "Time", defaultH: 6, description: "Current season", keywords: "season winter summer", defaultProps: { hemisphere: "north", label: "" } },
  { type: "zodiac", label: "Zodiac", glyph: "♈", category: "Time", defaultH: 6, description: "Star sign from a date", keywords: "zodiac star sign", defaultProps: { date: "2000-08-15", label: "" } },

  // ===== v0.6 — trackers =====
  { type: "habitTracker", label: "Habit tracker", glyph: "•", category: "Trackers", defaultH: 5, description: "A week of dots", keywords: "habit streak week", defaultProps: { label: "This week", days: "x x x . x . ." } },
  { type: "streak", label: "Streak", glyph: "✶", category: "Trackers", defaultH: 5, description: "Big day count", keywords: "streak days count", defaultProps: { value: 42, label: "day streak" } },
  { type: "waterTracker", label: "Water", glyph: "▮", category: "Trackers", defaultH: 5, description: "Glasses out of a goal", keywords: "water hydration glasses", defaultProps: { value: 5, total: 8, label: "Water" } },
  { type: "wifiCard", label: "Wi-Fi card", glyph: "≋", category: "Trackers", defaultH: 5, description: "Network + password", keywords: "wifi guest password cafe", defaultProps: { ssid: "Café Guest", password: "staycalm", label: "Wi-Fi" } },

  // ===== v0.6 — live (server-fetched, keyless) =====
  { type: "forecast", label: "Forecast", glyph: "☁", category: "Live", defaultH: 7, description: "Multi-day weather", keywords: "weather forecast days", defaultProps: { latitude: 28.6139, longitude: 77.209, label: "", days: 4 } },
  { type: "windCompass", label: "Wind", glyph: "➤", category: "Live", defaultH: 7, description: "Wind speed & direction", keywords: "wind compass weather", defaultProps: { latitude: 28.6139, longitude: 77.209, label: "" } },
  { type: "uvIndex", label: "UV index", glyph: "☀", category: "Live", defaultH: 5, description: "Today's UV index", keywords: "uv sun index weather", defaultProps: { latitude: 28.6139, longitude: 77.209, label: "" } },
  { type: "airQuality", label: "Air quality", glyph: "⊙", category: "Live", defaultH: 6, description: "AQI and PM2.5", keywords: "air quality aqi pollution", defaultProps: { latitude: 28.6139, longitude: 77.209, label: "" } },
  { type: "precip", label: "Rain chance", glyph: "☂", category: "Live", defaultH: 5, description: "Precipitation probability", keywords: "rain precipitation weather", defaultProps: { latitude: 28.6139, longitude: 77.209, label: "" } },
  { type: "headlines", label: "Headlines", glyph: "▤", category: "Live", defaultH: 8, description: "Titles from an RSS feed", keywords: "news rss feed headlines", defaultProps: { url: "https://hnrss.org/frontpage", max: 5, label: "Headlines" } },
  { type: "currencyRate", label: "Currency", glyph: "$", category: "Live", defaultH: 5, description: "Live exchange rate", keywords: "currency forex exchange money", defaultProps: { from: "USD", to: "INR", label: "" } },
  { type: "cryptoPrice", label: "Crypto", glyph: "₿", category: "Live", defaultH: 5, description: "Live coin price", keywords: "crypto bitcoin price", defaultProps: { coin: "bitcoin", vs: "usd", label: "" } },
  { type: "customData", label: "Custom data", glyph: "◇", category: "Live", defaultH: 4, description: "A value you push via the API or a webhook", keywords: "custom data api webhook automation value key", defaultProps: { key: "", label: "", format: "text" } },
  { type: "onThisDay", label: "On this day", glyph: "✦", category: "Live", defaultH: 8, description: "Historical events today", keywords: "history wikipedia events", defaultProps: { max: 4, label: "On this day" } },
  { type: "wikiToday", label: "Wikipedia", glyph: "W", category: "Live", defaultH: 7, description: "A Wikipedia summary", keywords: "wikipedia article reference", defaultProps: { title: "", label: "From Wikipedia" } },
  { type: "quoteLive", label: "Quote of the day", glyph: "“", category: "Live", defaultH: 5, description: "A fresh daily quote", keywords: "quote inspiration daily", defaultProps: { label: "" } },
  { type: "factLive", label: "Fact of the day", glyph: "✓", category: "Live", defaultH: 5, description: "A random fact", keywords: "fact trivia daily", defaultProps: { label: "Did you know" } },
  { type: "hackerNews", label: "Hacker News", glyph: "Y", category: "Live", defaultH: 8, description: "Top story titles", keywords: "hacker news tech headlines", defaultProps: { max: 5, label: "Hacker News" } },
  { type: "githubStats", label: "GitHub stats", glyph: "★", category: "Live", defaultH: 5, description: "Stars or followers", keywords: "github stars followers", defaultProps: { user: "torvalds", repo: "", label: "" } },
  { type: "nextHoliday", label: "Next holiday", glyph: "▣", category: "Live", defaultH: 5, description: "Upcoming public holiday", keywords: "holiday public next", defaultProps: { country: "IN", label: "Next holiday" } },
  { type: "issNow", label: "ISS position", glyph: "⊕", category: "Live", defaultH: 5, description: "Live ISS coordinates", keywords: "iss space station orbit", defaultProps: { label: "ISS now" } },
  { type: "jsonFeed", label: "Custom URL", glyph: "◇", category: "Live", defaultH: 6, description: "Any JSON URL → a {{template}}", keywords: "json api custom plugin url webhook integration byo", defaultProps: { url: "https://api.frankfurter.app/latest?from=USD&to=INR", template: "USD → INR\n{{rates.INR}}", label: "Custom feed", refreshSeconds: 900 } },

  // ===== v0.8 — text & structure =====
  { type: "signature", label: "Signature", glyph: "✍", category: "Text", defaultH: 4, description: "Name over a signature line", keywords: "sign name signoff", defaultProps: { name: "Your Name", role: "" } },
  { type: "address", label: "Address", glyph: "⌖", category: "Text", defaultH: 5, description: "A postal address block", keywords: "address location contact", defaultProps: { content: "221B Baker Street\nLondon NW1\nUnited Kingdom" } },
  { type: "byline", label: "Byline", glyph: "✑", category: "Text", defaultH: 2, description: "Author and date", keywords: "byline author credit", defaultProps: { author: "Author", date: "Today" } },
  { type: "legend", label: "Legend", glyph: "⊜", category: "Text", defaultH: 5, description: "A key of symbols", keywords: "legend key symbols", defaultProps: { items: "● Open\n○ Closed\n◐ Partial" } },
  { type: "breadcrumb", label: "Breadcrumb", glyph: "›", category: "Text", defaultH: 2, description: "A path trail", keywords: "breadcrumb path nav", defaultProps: { path: "Home / Section / Page" } },
  { type: "noticeBar", label: "Notice", glyph: "⚠", category: "Text", defaultH: 3, description: "A callout bar with an icon", keywords: "notice warning alert", defaultProps: { content: "Heads up — something to know.", icon: "⚠" } },
  { type: "keyCombo", label: "Shortcut", glyph: "⌘", category: "Text", defaultH: 3, description: "A keyboard shortcut", keywords: "keyboard shortcut keys hotkey", defaultProps: { keys: "Cmd S", label: "" } },
  { type: "dividerLabeled", label: "Labeled rule", glyph: "—", category: "Text", defaultH: 1, description: "A divider with a label", keywords: "divider rule section", defaultProps: { label: "SECTION" } },

  // ===== v0.8 — visual =====
  { type: "iconRow", label: "Icon row", glyph: "✦", category: "Media", defaultH: 4, description: "A row of big symbols", keywords: "icons symbols row emoji", defaultProps: { symbols: "★ ☀ ☾ ✶ ◆" } },
  { type: "statRow", label: "Stat row", glyph: "⌗", category: "Numbers", defaultH: 5, description: "Several mini stats in a row", keywords: "stats kpis row", defaultProps: { items: "12 | Sales\n89% | Uptime\n4.8 | Rating" } },
  { type: "spacerDots", label: "Dot spacer", glyph: "⋯", category: "Text", defaultH: 1, description: "A quiet · · · break", keywords: "spacer dots break", defaultProps: {} },
  { type: "frame", label: "Frame", glyph: "▢", category: "Text", defaultH: 5, description: "A labeled bordered box", keywords: "frame box border", defaultProps: { label: "NOTE", content: "Framed content." } },

  // ===== v0.8 — charts =====
  { type: "lineChart", label: "Line chart", glyph: "📈", category: "Charts", defaultH: 6, description: "A larger line chart", keywords: "line chart graph trend", defaultProps: { values: "3,5,4,6,7,6,8,7,9,8,10", label: "" } },
  { type: "areaChart", label: "Area chart", glyph: "◣", category: "Charts", defaultH: 6, description: "A filled area chart", keywords: "area chart fill graph", defaultProps: { values: "3,5,4,6,7,6,8,7,9", label: "" } },
  { type: "bulletGraph", label: "Bullet graph", glyph: "▸", category: "Charts", defaultH: 4, description: "Value vs target bar", keywords: "bullet target goal kpi", defaultProps: { value: 72, target: 80, label: "" } },
  { type: "horizontalBars", label: "H-bars", glyph: "▬", category: "Charts", defaultH: 6, description: "Labeled horizontal bars", keywords: "bars chart horizontal", defaultProps: { items: "Mon | 8\nTue | 5\nWed | 9\nThu | 6" } },
  { type: "rankingList", label: "Ranking", glyph: "❶", category: "Charts", defaultH: 6, description: "A ranked bar list", keywords: "ranking leaderboard top", defaultProps: { items: "Alice | 92\nBob | 85\nCara | 78" } },
  { type: "waffle", label: "Waffle", glyph: "▦", category: "Charts", defaultH: 8, description: "A 100-dot percent grid", keywords: "waffle percent grid", defaultProps: { value: 64, label: "" } },
  { type: "signalBars", label: "Signal", glyph: "▮", category: "Charts", defaultH: 5, description: "Strength bars", keywords: "signal strength bars wifi", defaultProps: { value: 3, label: "Signal" } },
  { type: "thermometer", label: "Thermometer", glyph: "▯", category: "Charts", defaultH: 7, description: "A vertical fill gauge", keywords: "thermometer level fill", defaultProps: { value: 22, min: 0, max: 40, unit: "°", label: "" } },
  { type: "comparison", label: "Comparison", glyph: "⇄", category: "Charts", defaultH: 4, description: "A vs B split bar", keywords: "comparison versus split", defaultProps: { leftLabel: "A", leftValue: 60, rightLabel: "B", rightValue: 40 } },
  { type: "percentList", label: "Percent split", glyph: "◔", category: "Charts", defaultH: 4, description: "A stacked percent bar", keywords: "percent breakdown split stack", defaultProps: { items: "Design | 40\nDev | 35\nQA | 25" } },

  // ===== v0.8 — time & calendar =====
  { type: "monthCalendar", label: "Month", glyph: "▦", category: "Time", defaultH: 10, description: "This month, today marked", keywords: "calendar month grid date", defaultProps: { label: "" } },
  { type: "weekStrip", label: "Week strip", glyph: "▤", category: "Time", defaultH: 5, description: "Mon–Sun, today marked", keywords: "week days strip", defaultProps: { label: "" } },
  { type: "nowNext", label: "Now / next", glyph: "▷", category: "Time", defaultH: 5, description: "Current + next from a schedule", keywords: "now next agenda schedule", defaultProps: { items: "09:00 | Standup\n12:30 | Lunch\n16:00 | Review" } },
  { type: "ageCounter", label: "Age", glyph: "⧗", category: "Time", defaultH: 5, description: "Years since a date", keywords: "age years since birthday", defaultProps: { since: "2000-01-01", label: "Age" } },
  { type: "anniversary", label: "Anniversary", glyph: "❤", category: "Time", defaultH: 4, description: "Days until the next occurrence", keywords: "anniversary recurring yearly", defaultProps: { date: "2020-06-13", label: "Anniversary" } },
  { type: "timeBlocks", label: "Time blocks", glyph: "▣", category: "Time", defaultH: 6, description: "Today's time blocks", keywords: "schedule blocks plan day", defaultProps: { items: "09–10 | Focus\n10–11 | Email\n11–13 | Build" } },
  { type: "shiftStatus", label: "Open hours", glyph: "◷", category: "Time", defaultH: 5, description: "Open now? from hours", keywords: "open closed hours shift", defaultProps: { open: 9, close: 17, label: "" } },
  { type: "pomodoro", label: "Pomodoro", glyph: "◓", category: "Time", defaultH: 5, description: "Live focus / break timer", keywords: "pomodoro focus timer countdown", defaultProps: { workMin: 25, breakMin: 5, label: "" } },
  { type: "stopwatch", label: "Stopwatch", glyph: "⏱", category: "Time", defaultH: 5, description: "Counts up from a start time", keywords: "stopwatch elapsed count up timer running", defaultProps: { label: "Elapsed", since: "2026-01-01T09:00", showSeconds: true } },
  { type: "liveCounter", label: "Live counter", glyph: "⧗", category: "Numbers", defaultH: 4, description: "A number that climbs on its own", keywords: "live counter ticking running total rate auto", defaultProps: { label: "Saved today", start: 0, perDay: 1440, since: "2026-01-01", unit: "", decimals: 0 } },

  // ===== v0.8 — trackers =====
  { type: "monthHabit", label: "Month habit", glyph: "⣿", category: "Trackers", defaultH: 5, description: "A month of habit dots", keywords: "habit month dots streak", defaultProps: { label: "This month", days: "x x . x x . . x x x . x" } },
  { type: "savingsGoal", label: "Savings goal", glyph: "▰", category: "Trackers", defaultH: 5, description: "Saved vs target", keywords: "savings goal money budget", defaultProps: { saved: 6500, target: 10000, unit: "₹", label: "Savings" } },
  { type: "readingNow", label: "Reading", glyph: "▤", category: "Trackers", defaultH: 5, description: "Book + progress", keywords: "reading book progress", defaultProps: { title: "A Calm Book", author: "Anon", percent: 45 } },
  { type: "weightTrend", label: "Weight trend", glyph: "∿", category: "Trackers", defaultH: 6, description: "A measurement trend", keywords: "weight trend measurement spark", defaultProps: { values: "72,71.6,71.4,71,70.8", unit: "kg", label: "Weight" } },
  { type: "moodWeek", label: "Mood week", glyph: "☻", category: "Trackers", defaultH: 5, description: "A week of moods", keywords: "mood week faces feelings", defaultProps: { moods: "🙂 😐 🙂 😀 😐 🙁 🙂" } },
  { type: "checklistProgress", label: "Checklist %", glyph: "☑", category: "Trackers", defaultH: 6, description: "A checklist with progress", keywords: "checklist progress tasks done", defaultProps: { items: "x Ship\nx Test\nWrite docs\nCelebrate", label: "Tasks" } },

  // ===== v0.8 — signage & office =====
  { type: "roomStatus", label: "Room status", glyph: "◫", category: "Info", defaultH: 6, description: "Free / busy", keywords: "room free busy meeting booking", defaultProps: { room: "Room 3", status: "free" } },
  { type: "directory", label: "Directory", glyph: "≡", category: "Info", defaultH: 7, description: "Names → locations", keywords: "directory wayfinding rooms", defaultProps: { items: "Dr. Rao | Room 3\nReception | Floor 1\nPharmacy | Floor 2" } },
  { type: "eventBanner", label: "Event", glyph: "✸", category: "Info", defaultH: 5, description: "A big event + time", keywords: "event banner announce when", defaultProps: { title: "Annual Meetup", when: "Sat 6 PM · Hall A" } },
  { type: "openSign", label: "Open sign", glyph: "⊙", category: "Info", defaultH: 6, description: "OPEN / CLOSED", keywords: "open closed sign shop", defaultProps: { open: true, label: "" } },
  { type: "nowPlaying", label: "Now playing", glyph: "♪", category: "Info", defaultH: 5, description: "Track + artist", keywords: "music now playing song", defaultProps: { title: "Quiet Song", artist: "Someone" } },
  { type: "splitFlap", label: "Split-flap", glyph: "❑", category: "Info", defaultH: 4, description: "A departures-board word", keywords: "splitflap board departures retro", defaultProps: { text: "DEPARTURES" } },

  // ===== v0.9 — text & structure =====
  { type: "epigraph", label: "Epigraph", glyph: "❛", category: "Text", defaultH: 4, description: "An opening quotation", keywords: "epigraph quote opening italic", defaultProps: { content: "We shape our tools, and thereafter our tools shape us.", author: "M. McLuhan" } },
  { type: "kicker", label: "Kicker", glyph: "‹", category: "Text", defaultH: 3, description: "Eyebrow over a title", keywords: "kicker eyebrow headline", defaultProps: { kicker: "FEATURED", title: "The headline goes here" } },
  { type: "ticker", label: "Ticker", glyph: "▸", category: "Text", defaultH: 2, description: "A single scrolling-style line", keywords: "ticker marquee news strip", defaultProps: { content: "Calm news · quiet updates · nothing urgent" } },
  { type: "glossary", label: "Glossary", glyph: "𝐆", category: "Text", defaultH: 6, description: "Terms and meanings", keywords: "glossary terms definitions", defaultProps: { items: "Glance | a two-second read\nCalm | no notifications\nBoard | one screen's layout" } },
  { type: "footnotes", label: "Footnotes", glyph: "†", category: "Text", defaultH: 4, description: "Numbered small notes", keywords: "footnotes notes references", defaultProps: { items: "Prices include tax.\nSubject to availability.\nMIT licensed." } },
  { type: "highlight", label: "Highlight", glyph: "▮", category: "Text", defaultH: 4, description: "One emphasized line", keywords: "highlight emphasis key", defaultProps: { content: "The one thing worth remembering today." } },
  { type: "letterhead", label: "Letterhead", glyph: "✒", category: "Text", defaultH: 4, description: "Name + tagline + rule", keywords: "letterhead header brand name", defaultProps: { name: "Your Name", tagline: "Calm by design" } },
  { type: "fieldRow", label: "Field", glyph: "≔", category: "Text", defaultH: 3, description: "A label and a value", keywords: "field label value status", defaultProps: { label: "Status", value: "On track" } },
  { type: "contents", label: "Contents", glyph: "☰", category: "Text", defaultH: 6, description: "A table of contents", keywords: "contents toc index outline", defaultProps: { items: "Introduction\nThe idea\nHow it works\nRunning it" } },
  { type: "aside", label: "Aside", glyph: "❘", category: "Text", defaultH: 4, description: "A side note", keywords: "aside note margin", defaultProps: { content: "A quiet note set off to the side." } },
  { type: "postscript", label: "Postscript", glyph: "℘", category: "Text", defaultH: 2, description: "A P.S. note", keywords: "postscript ps note", defaultProps: { content: "One more small thing worth knowing." } },
  { type: "mantra", label: "Mantra", glyph: "✺", category: "Text", defaultH: 4, description: "A short centered phrase", keywords: "mantra motto phrase", defaultProps: { content: "Look, understand, move on." } },

  // ===== v0.9 — media & identity =====
  { type: "emojiStat", label: "Emoji stat", glyph: "✨", category: "Media", defaultH: 5, description: "A huge emoji + label", keywords: "emoji big symbol stat", defaultProps: { emoji: "✨", label: "" } },
  { type: "monogram", label: "Monogram", glyph: "◉", category: "Media", defaultH: 5, description: "Initials in a circle", keywords: "monogram initials brand", defaultProps: { letters: "GO", label: "" } },
  { type: "flag", label: "Flag", glyph: "⚑", category: "Media", defaultH: 4, description: "A flag + label", keywords: "flag country emoji", defaultProps: { emoji: "🏳", label: "Country" } },
  { type: "logoText", label: "Logo text", glyph: "Ⓛ", category: "Media", defaultH: 4, description: "Letter-spaced brand text", keywords: "logo brand wordmark text", defaultProps: { text: "GLANCE" } },
  { type: "profileCard", label: "Profile", glyph: "☻", category: "Media", defaultH: 6, description: "Name, role and a line", keywords: "profile person card bio", defaultProps: { name: "Your Name", role: "Title", detail: "A short line about you." } },
  { type: "peopleList", label: "People", glyph: "≡", category: "Media", defaultH: 6, description: "Names → roles", keywords: "people staff directory roles", defaultProps: { items: "Dr. Rao | Cardiology\nA. Smith | Reception\nJ. Lee | Pharmacy" } },

  // ===== v0.9 — numbers =====
  { type: "bigNumber", label: "Big number", glyph: "№", category: "Numbers", defaultH: 5, description: "A giant number + caption", keywords: "number big stat hero", defaultProps: { value: "42", caption: "the answer" } },
  { type: "percentBig", label: "Percent", glyph: "%", category: "Numbers", defaultH: 4, description: "Big percent + bar", keywords: "percent big progress", defaultProps: { value: 72, label: "" } },
  { type: "deltaStat", label: "Delta stat", glyph: "▴", category: "Numbers", defaultH: 5, description: "Value with up/down delta", keywords: "delta change trend stat", defaultProps: { value: "1,284", delta: "+12%", label: "Visitors" } },
  { type: "moneyStat", label: "Money", glyph: "¤", category: "Numbers", defaultH: 5, description: "A currency amount", keywords: "money currency revenue amount", defaultProps: { amount: "12,500", currency: "₹", label: "Revenue" } },
  { type: "counterPair", label: "Counter pair", glyph: "⊞", category: "Numbers", defaultH: 5, description: "Two side-by-side counts", keywords: "counter pair in out two", defaultProps: { leftLabel: "In", leftValue: "24", rightLabel: "Out", rightValue: "18" } },
  { type: "targetMeter", label: "Target meter", glyph: "◎", category: "Numbers", defaultH: 4, description: "Value vs target + bar", keywords: "target meter goal progress", defaultProps: { value: 72, target: 100, unit: "", label: "Goal" } },
  { type: "unitStat", label: "Unit stat", glyph: "±", category: "Numbers", defaultH: 5, description: "A value with a unit", keywords: "unit value measurement stat", defaultProps: { value: "36.6", unit: "°C", label: "Temperature" } },
  { type: "progressBars", label: "Progress bars", glyph: "▤", category: "Numbers", defaultH: 6, description: "Several labeled % bars", keywords: "progress bars percent multiple", defaultProps: { items: "Design | 80\nDev | 55\nQA | 30" } },

  // ===== v0.9 — charts =====
  { type: "lollipopChart", label: "Lollipop", glyph: "⊶", category: "Charts", defaultH: 6, description: "Lollipop bar chart", keywords: "lollipop chart bars", defaultProps: { items: "Mon | 8\nTue | 5\nWed | 9\nThu | 6" } },
  { type: "winLossBar", label: "Win / loss", glyph: "▪", category: "Charts", defaultH: 4, description: "Win/loss/tie ticks", keywords: "win loss streak record sports", defaultProps: { values: "1,1,-1,1,0,-1,1,1", label: "" } },
  { type: "dotMatrix", label: "Dot matrix", glyph: "⣏", category: "Charts", defaultH: 6, description: "Filled dots out of N", keywords: "dots matrix count grid", defaultProps: { value: 36, total: 50, label: "" } },
  { type: "rangeBar", label: "Range", glyph: "⊢", category: "Charts", defaultH: 4, description: "A value within a range", keywords: "range min max value slider", defaultProps: { min: 0, max: 100, value: 64, label: "" } },
  { type: "bubbleScale", label: "Bubbles", glyph: "◌", category: "Charts", defaultH: 6, description: "Circles sized by value", keywords: "bubble circles scale sizes", defaultProps: { items: "A | 8\nB | 4\nC | 6\nD | 2" } },
  { type: "starBar", label: "Star bar", glyph: "★", category: "Charts", defaultH: 3, description: "Filled stars out of N", keywords: "stars score rating bar", defaultProps: { value: 7, max: 10, label: "" } },
  { type: "columnLabels", label: "Columns", glyph: "▥", category: "Charts", defaultH: 6, description: "Labeled vertical bars", keywords: "columns bars labels chart", defaultProps: { items: "Q1 | 12\nQ2 | 18\nQ3 | 9\nQ4 | 21" } },
  { type: "deltaList", label: "Delta list", glyph: "↕", category: "Charts", defaultH: 6, description: "Rows with up/down deltas", keywords: "delta list change arrows", defaultProps: { items: "Sales | +12\nCosts | -4\nUsers | +8" } },
  { type: "gaugeMini", label: "Mini gauge", glyph: "◔", category: "Charts", defaultH: 5, description: "A small ring gauge", keywords: "gauge ring percent mini", defaultProps: { value: 64, label: "" } },
  { type: "histogram", label: "Histogram", glyph: "▆", category: "Charts", defaultH: 6, description: "Many vertical bars", keywords: "histogram distribution bars", defaultProps: { values: "2,4,7,9,6,3,5,8,4,2", label: "" } },

  // ===== v0.9 — time computed =====
  { type: "fullDate", label: "Full date", glyph: "▦", category: "Time", defaultH: 5, description: "Weekday + full date", keywords: "date today weekday full", defaultProps: { label: "" } },
  { type: "monthName", label: "Month", glyph: "M", category: "Time", defaultH: 4, description: "The current month name", keywords: "month name current", defaultProps: { label: "" } },
  { type: "timeOfDay", label: "Time of day", glyph: "◐", category: "Time", defaultH: 4, description: "Morning / Afternoon / Evening", keywords: "time of day part morning", defaultProps: { label: "" } },
  { type: "quarterProgress", label: "Quarter", glyph: "◔", category: "Time", defaultH: 3, description: "Percent through the quarter", keywords: "quarter progress q1 fiscal", defaultProps: { label: "Quarter" } },
  { type: "daysLeftMonth", label: "Days left", glyph: "⌛", category: "Time", defaultH: 4, description: "Days left this month", keywords: "days left month remaining", defaultProps: { label: "" } },
  { type: "unixClock", label: "Unix time", glyph: "⊡", category: "Time", defaultH: 4, description: "Epoch seconds, live", keywords: "unix epoch timestamp geek", defaultProps: { label: "Unix" } },
  { type: "tzPair", label: "Two zones", glyph: "⊗", category: "Time", defaultH: 5, description: "Two timezones at once", keywords: "timezone pair world clock two", defaultProps: { labelA: "NYC", tzA: "America/New_York", labelB: "Tokyo", tzB: "Asia/Tokyo" } },
  { type: "nextWeekday", label: "Next weekday", glyph: "▷", category: "Time", defaultH: 4, description: "Days to the next given day", keywords: "next weekday until monday friday", defaultProps: { weekday: 1, label: "" } },

  // ===== v0.9 — nature computed =====
  { type: "daylight", label: "Daylight", glyph: "☀", category: "Nature", defaultH: 5, description: "Length of today's daylight", keywords: "daylight day length sun hours", defaultProps: { latitude: 28.6139, longitude: 77.209, label: "" } },
  { type: "moonProgress", label: "Moon %", glyph: "☽", category: "Nature", defaultH: 5, description: "Tonight's illumination", keywords: "moon illumination percent phase", defaultProps: { label: "" } },
  { type: "seasonProgress", label: "Season %", glyph: "❅", category: "Nature", defaultH: 5, description: "Percent through the season", keywords: "season progress percent", defaultProps: { hemisphere: "north", label: "Season" } },
  { type: "goldenHour", label: "Golden hour", glyph: "◑", category: "Nature", defaultH: 5, description: "Morning & evening golden hours", keywords: "golden hour photography sun light", defaultProps: { latitude: 28.6139, longitude: 77.209, label: "" } },

  // ===== v0.9 — trackers =====
  { type: "goalProgress", label: "Goal", glyph: "◎", category: "Trackers", defaultH: 5, description: "Value vs target + bar", keywords: "goal progress target tracker", defaultProps: { value: 6, target: 10, unit: "", label: "Goal" } },
  { type: "stepsToday", label: "Steps", glyph: "👣", category: "Trackers", defaultH: 5, description: "Steps vs a daily goal", keywords: "steps walk fitness goal", defaultProps: { value: 6400, goal: 10000, label: "Steps" } },
  { type: "streakPair", label: "Streak pair", glyph: "✶", category: "Trackers", defaultH: 5, description: "Current vs best streak", keywords: "streak current best record", defaultProps: { current: 12, best: 48, label: "Streak" } },
  { type: "bookList", label: "Reading list", glyph: "▤", category: "Trackers", defaultH: 6, description: "Books → authors", keywords: "books reading list shelf", defaultProps: { items: "A Calm Book | Anon\nDeep Work | C. Newport\nSilence | E. Prochnik" } },
  { type: "moodToday", label: "Mood today", glyph: "☺", category: "Trackers", defaultH: 5, description: "One big mood face", keywords: "mood today face feeling", defaultProps: { emoji: "🙂", label: "Today" } },
  { type: "budgetLine", label: "Budget", glyph: "▰", category: "Trackers", defaultH: 5, description: "Spent vs budget left", keywords: "budget spent money left", defaultProps: { spent: 6500, budget: 10000, unit: "₹", label: "Budget" } },

  // ===== v0.9 — info & signage =====
  { type: "welcomeSign", label: "Welcome", glyph: "✦", category: "Info", defaultH: 6, description: "A big welcome + name", keywords: "welcome greeting reception sign", defaultProps: { name: "Guest", message: "Welcome" } },
  { type: "priceTag", label: "Price tag", glyph: "¤", category: "Info", defaultH: 5, description: "An item and a big price", keywords: "price tag item cost menu", defaultProps: { item: "Espresso", price: "120", unit: "₹" } },
  { type: "todaySpecial", label: "Special", glyph: "✸", category: "Info", defaultH: 5, description: "Today's special + detail", keywords: "special today menu feature", defaultProps: { title: "Today's Special", detail: "Saffron risotto · 320" } },
  { type: "phoneNumber", label: "Phone", glyph: "☎", category: "Info", defaultH: 4, description: "A big phone number", keywords: "phone number call contact", defaultProps: { label: "Reception", number: "+91 98765 43210" } },
  { type: "socialHandle", label: "Social", glyph: "@", category: "Info", defaultH: 4, description: "A platform and handle", keywords: "social handle instagram twitter", defaultProps: { platform: "Instagram", handle: "@glanceos" } },
  { type: "wayfinding", label: "Wayfinding", glyph: "➜", category: "Info", defaultH: 7, description: "Places with directions", keywords: "wayfinding directions signage arrows", defaultProps: { items: "Reception | → Floor 1\nPharmacy | → Floor 2\nExit | ← Left" } },
];

export const CATEGORIES: BlockCategory[] = ["Text", "Media", "Numbers", "Charts", "Time", "Nature", "Trackers", "Info", "Live", "Smart home"];

export const blockFor = (type: WidgetType): BlockDef => BLOCKS.find((b) => b.type === type)!;

let counter = 0;
export function newWidgetId(): string {
  counter += 1;
  return `w${Date.now().toString(36)}${counter.toString(36)}`;
}

export function makeBlock(type: WidgetType): WidgetT {
  const block = blockFor(type);
  return {
    id: newWidgetId(),
    type,
    width: 1,
    style: { invert: false, align: "start", valign: "top" },
    props: structuredClone(block.defaultProps),
  } as WidgetT;
}

// Which prop holds a block's primary text — what inline editing types into.
export const TEXT_PROP: Partial<Record<WidgetType, string>> = {
  text: "content",
  heading: "content",
  subheading: "content",
  label: "content",
  quote: "content",
  callout: "content",
  banner: "content",
  code: "content",
  bulletList: "items",
  numberedList: "items",
  checklist: "items",
  keyValue: "pairs",
  table: "content",
  hours: "content",
  menuList: "content",
  definition: "meaning",
  stat: "value",
  badge: "text",
  nameTag: "name",
  // v0.6
  lead: "content",
  pullquote: "content",
  dropCap: "content",
  finePrint: "content",
  numberedHeading: "content",
  verse: "content",
  ascii: "content",
  tagCloud: "tags",
  timeline: "items",
  steps: "items",
  faq: "items",
  // v0.8
  signature: "name",
  address: "content",
  byline: "author",
  breadcrumb: "path",
  noticeBar: "content",
  frame: "content",
  eventBanner: "title",
  nowPlaying: "title",
  splitFlap: "text",
  roomStatus: "room",
  // v0.9
  epigraph: "content",
  kicker: "title",
  ticker: "content",
  highlight: "content",
  letterhead: "name",
  fieldRow: "value",
  aside: "content",
  postscript: "content",
  mantra: "content",
  logoText: "text",
  profileCard: "name",
  bigNumber: "value",
  moneyStat: "amount",
  unitStat: "value",
  welcomeSign: "name",
  priceTag: "item",
  todaySpecial: "title",
  phoneNumber: "number",
  socialHandle: "handle",
};

// Blocks that can draw from a live data source (the toolbar's ⟿ Data tab).
export const SERIES_BLOCKS = new Set<WidgetType>([
  "sparkline", "barChart", "lineChart", "areaChart", "histogram", "heatStrip", "winLossBar", "weightTrend", "kpiSpark",
]);
export const SCALAR_BLOCKS = new Set<WidgetType>([
  "stat", "metric", "bigNumber", "trend", "deltaStat", "percentBig", "progress", "gauge",
  // v4.7 — signage/sensor blocks made bindable (sensor → Home Assistant, money → FX, …);
  // each falls back to its typed prop when no source is attached, so old boards are unchanged.
  "sensor", "thermostat", "moneyStat", "deviceStatus", "roomStatus", "openSign", "splitFlap",
]);
// Newline-joined text lists (Todoist/Notion/GitHub issues → a list block).
export const LIST_BLOCKS = new Set<WidgetType>(["bulletList", "numberedList", "checklist"]);
// Already-typed live shapes — bind the whole block, no field mapping needed.
export const PASSTHROUGH_BLOCKS = new Set<WidgetType>(["calendar", "headlines", "nowPlaying"]);
export const BINDABLE = new Set<WidgetType>([...SERIES_BLOCKS, ...SCALAR_BLOCKS, ...LIST_BLOCKS, ...PASSTHROUGH_BLOCKS]);

// Single-line types: never hold their own newlines.
export const SINGLE_LINE = new Set<WidgetType>([
  "heading", "subheading", "label", "banner", "stat", "badge", "nameTag", "numberedHeading",
  // v0.9
  "kicker", "ticker", "mantra", "logoText",
]);

// Prose types where pressing Enter starts a NEW text line below (Notion-style),
// like typing a document. Shift+Enter still inserts a literal newline.
// Everything else editable (lists, code, callout, tables…) keeps Enter = newline.
export const ENTER_BREAKS = new Set<WidgetType>([
  "text", "heading", "subheading", "lead", "pullquote", "quote", "label", "banner", "numberedHeading",
  // v0.9
  "epigraph", "highlight", "aside", "kicker", "mantra", "ticker", "logoText",
]);
