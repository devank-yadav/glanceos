import { z } from "zod";

// The layout document, v3: a DOCUMENT, not a grid. A board is a vertical list
// of rows (lines, like a text editor); each row holds 1–4 blocks side by side
// (columns), sized by relative width weights, and has an explicit HEIGHT in
// units (the page is 24 units tall). Rows flow from the top at their own
// height — a new block does NOT fill the screen, and leftover space stays
// blank. v1 (grid) and v2 (rows without heights) migrate on read (see migrate.ts).

const httpUrl = z.url({ protocol: /^https?$/ });
const line = (max = 200) => z.string().max(max);

// --- existing props (v0.1/v0.2) ---
export const ClockProps = z.object({ showDate: z.boolean().default(true) });
export const WeatherProps = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  label: z.string().optional(),
});
export const CalendarProps = z.object({
  source: z.literal("ics"),
  url: z.url(),
  maxEvents: z.number().int().min(1).max(20).default(5),
});
export const TasksProps = z.object({
  listId: z.string().min(1).default("default"),
  maxItems: z.number().int().min(1).max(20).default(7),
});
export const TextProps = z.object({
  content: z.string().default(""),
  align: z.enum(["left", "center"]).default("left"),
  // "markdown" enables a safe inline subset (bold/italic/links); "plain" is verbatim.
  format: z.enum(["plain", "markdown"]).default("plain"),
});
export const QueueProps = z.object({
  queueId: z.string().min(1).default("default"),
  title: z.string().default("Now serving"),
});
export const HeadingProps = z.object({
  content: line().default("Heading"),
  level: z.union([z.literal(1), z.literal(2)]).default(1),
});
export const DividerProps = z.object({});
export const ImageProps = z.object({ url: z.union([httpUrl, z.string().regex(/^\/uploads\/[\w.-]+$/)]), fit: z.enum(["cover", "contain"]).default("cover") });
export const CalloutProps = z.object({
  content: line(500).default(""),
  emoji: z.string().max(8).default("💡"),
});

// --- text & structure ---
export const SubheadingProps = z.object({ content: line().default("Subheading") });
export const QuoteProps = z.object({ content: line(400).default("A calm quote."), author: line(80).default("") });
export const BulletListProps = z.object({ items: line(1000).default("First item\nSecond item\nThird item") });
export const NumberedListProps = z.object({ items: line(1000).default("First\nSecond\nThird") });
export const ChecklistProps = z.object({ items: line(1000).default("x Done already\nStill to do\nAnd this") });
export const CodeProps = z.object({ content: line(1000).default("echo hello"), language: line(20).default("") });
export const LabelProps = z.object({ content: line(60).default("LABEL") });
export const KeyValueProps = z.object({ pairs: line(1000).default("Status: Open\nRoom: 3") });
export const TableProps = z.object({ content: line(1500).default("Name, Status\nDoor, Locked\nLights, On"), header: z.boolean().default(true) });
export const LinkProps = z.object({ label: line(80).default("Open"), url: httpUrl });
export const BannerProps = z.object({ content: line(160).default("Announcement") });
export const DefinitionProps = z.object({ term: line(80).default("Word"), meaning: line(400).default("Its meaning.") });
export const SpacerProps = z.object({});

// --- numbers & metrics ---
export const StatProps = z.object({ value: line(20).default("0"), label: line(60).default("Label") });
export const MetricProps = z.object({
  label: line(60).default("Metric"),
  value: line(20).default("0"),
  unit: line(12).default(""),
  delta: line(16).default(""),
});
export const ProgressProps = z.object({ label: line(60).default(""), value: z.number().min(0).max(100).default(50) });
export const RatingProps = z.object({ value: z.number().min(0).max(5).default(4), label: line(60).default("") });
export const GaugeProps = z.object({ label: line(60).default(""), value: z.number().min(0).max(100).default(70) });

// --- time (computed on the screen from props + the local clock) ---
export const WorldClockProps = z.object({ label: line(40).default("London"), timeZone: line(64).default("Europe/London") });
export const CountdownProps = z.object({ label: line(60).default("Countdown"), target: z.string().default("2027-01-01T00:00:00") });
export const DaysUntilProps = z.object({ label: line(60).default("New Year"), target: z.string().default("2027-01-01") });
export const WeekNumberProps = z.object({ label: line(40).default("Week") });
export const DateBadgeProps = z.object({ label: line(40).default("") });
export const TimerProps = z.object({ label: line(60).default("Days since"), since: z.string().default("2026-01-01") });
export const AnalogClockProps = z.object({ label: line(40).default("") });

// --- nature (pure math, no network) ---
export const MoonPhaseProps = z.object({ label: line(40).default("") });
export const SunriseSunsetProps = z.object({
  latitude: z.number().min(-90).max(90).default(28.6139),
  longitude: z.number().min(-180).max(180).default(77.209),
  label: line(40).default(""),
});

// --- visual & identity ---
export const IconProps = z.object({ symbol: z.string().max(8).default("★"), label: line(60).default("") });
export const AvatarProps = z.object({ url: httpUrl, name: line(60).default("Name"), role: line(60).default("") });
export const BadgeProps = z.object({ text: line(40).default("Badge") });
export const NameTagProps = z.object({ name: line(60).default("Your Name"), subtitle: line(80).default("") });

// --- place & info (calm signage) ---
export const HoursProps = z.object({ content: line(600).default("Mon–Fri: 9–5\nSat: 10–2\nSun: closed") });
export const MenuListProps = z.object({ content: line(800).default("Espresso | 120\nLatte | 150\nCold brew | 180") });

// --- smart-home placeholders (static now; live in P4) ---
export const DeviceStatusProps = z.object({ label: line(60).default("Living room"), state: z.enum(["on", "off"]).default("off") });
export const SensorProps = z.object({ label: line(60).default("Humidity"), value: line(16).default("48"), unit: line(12).default("%") });
export const ThermostatProps = z.object({ label: line(60).default("Thermostat"), temperature: z.number().default(22), unit: z.enum(["C", "F"]).default("C") });

// ===== v0.6: emphasis style (optional, on every block) =====
export const BlockStyle = z.object({
  invert: z.boolean().default(false),
  align: z.enum(["start", "center", "end"]).default("start"),
  valign: z.enum(["top", "middle", "bottom"]).default("top"),
  // v9.0 designable objects — all optional → absent on existing boards, no migration,
  // applied as CSS classes on the cell (monochrome-safe: bg is a faint fg tint).
  pad: z.enum(["none", "s", "m", "l"]).optional(),
  border: z.enum(["none", "thin", "strong"]).optional(),
  radius: z.enum(["none", "s", "m", "l"]).optional(),
  bg: z.enum(["none", "subtle", "strong"]).optional(),
  size: z.enum(["xs", "s", "m", "l", "xl"]).optional(), // per-block text-size multiplier (m = unchanged)
});
export type BlockStyleT = z.infer<typeof BlockStyle>;

// ===== v0.6 blocks: text & structure =====
export const LeadProps = z.object({ content: line(400).default("A larger introduction that sets the tone.") });
export const PullquoteProps = z.object({ content: line(300).default("The quiet thing, said loudly."), author: line(80).default("") });
export const DropCapProps = z.object({ content: line(600).default("Once upon a calm morning, the screen showed only what mattered, and nothing more.") });
export const FinePrintProps = z.object({ content: line(400).default("Terms apply. Prices include tax.") });
export const NumberedHeadingProps = z.object({ number: line(8).default("01"), content: line(120).default("Section title") });
export const VerseProps = z.object({ content: line(600).default("first line\nsecond line\nthird line") });
export const AsciiProps = z.object({ content: line(1200).default("  /\\_/\\\n ( o.o )\n  > ^ <") });
export const TagCloudProps = z.object({ tags: line(400).default("calm, glance, minimal, quiet, focus") });
export const TimelineProps = z.object({ items: line(1000).default("09:00 | Standup\n12:30 | Lunch\n16:00 | Review") });
export const StepsProps = z.object({ items: line(1000).default("Plug in the screen\nConnect to Wi-Fi\nClaim with the code") });
export const FaqProps = z.object({ items: line(1500).default("Is it free? | Yes, MIT licensed.\nNeed an account? | One per install.") });
export const ProsConsProps = z.object({ pros: line(600).default("Quiet\nFast\nYours"), cons: line(600).default("No color\nNo apps") });

// ===== v0.6 blocks: charts (from prop numbers) =====
export const SparklineProps = z.object({ values: line(400).default("3,5,4,6,7,6,8,7,9"), label: line(60).default("") });
export const BarChartProps = z.object({ values: line(400).default("4,8,6,10,7,9"), label: line(60).default("") });
export const ProgressRingProps = z.object({ value: z.number().min(0).max(100).default(64), label: line(60).default("") });
export const DotProgressProps = z.object({ value: z.number().int().min(0).max(60).default(7), total: z.number().int().min(1).max(60).default(10), label: line(60).default("") });
export const ScoreboardProps = z.object({ leftLabel: line(30).default("Home"), leftScore: line(8).default("2"), rightLabel: line(30).default("Away"), rightScore: line(8).default("1") });
export const FractionProps = z.object({ numerator: line(8).default("3"), denominator: line(8).default("10"), label: line(60).default("") });
export const TallyProps = z.object({ value: z.number().int().min(0).max(200).default(12), label: line(60).default("") });
export const HeatStripProps = z.object({ values: line(400).default("0,1,2,3,2,4,1,0,3,4,2,1"), label: line(60).default("") });
export const TrendProps = z.object({ value: line(20).default("1,284"), delta: line(16).default("+12%"), label: line(60).default("Visitors") });
export const KpiSparkProps = z.object({ value: line(20).default("92"), unit: line(8).default("%"), label: line(60).default("Uptime"), values: line(400).default("88,90,89,93,92") });

// ===== v0.6 blocks: time computed (local clock) =====
export const DayProgressProps = z.object({ label: line(60).default("Day") });
export const YearProgressProps = z.object({ label: line(60).default("Year") });
export const WeekProgressProps = z.object({ label: line(60).default("Week") });
// #154 — when showContext is on, the server composes a one-line contextual greeting from
// the user's calendar + weather ("Good morning · 3 meetings today · 18°, light rain"); the
// screen falls back to the plain time-of-day greeting when there's no context/connection.
export const GreetingProps = z.object({ name: line(60).default(""), showContext: z.boolean().default(false), maxContextLength: z.number().int().min(20).max(300).default(200) });
export const RomanClockProps = z.object({ label: line(40).default("") });
export const BinaryClockProps = z.object({ label: line(40).default("") });
export const SeasonClockProps = z.object({ hemisphere: z.enum(["north", "south"]).default("north"), label: line(40).default("") });
export const ZodiacProps = z.object({ date: z.string().default("2000-08-15"), label: line(40).default("") });

// ===== v0.6 blocks: trackers & cards =====
export const HabitTrackerProps = z.object({ label: line(60).default("This week"), days: line(40).default("x x x . x . .") });
export const StreakProps = z.object({ value: z.number().int().min(0).max(99999).default(42), label: line(60).default("day streak") });
export const WaterTrackerProps = z.object({ value: z.number().int().min(0).max(20).default(5), total: z.number().int().min(1).max(20).default(8), label: line(60).default("Water") });
export const WifiCardProps = z.object({ ssid: line(60).default("Café Guest"), password: line(60).default("staycalm"), label: line(40).default("Wi-Fi") });

// ===== v0.6 blocks: live (server-fetched, keyless, cached) =====
const geo = {
  latitude: z.number().min(-90).max(90).default(28.6139),
  longitude: z.number().min(-180).max(180).default(77.209),
  label: line(40).default(""),
};
export const ForecastProps = z.object({ ...geo, days: z.number().int().min(1).max(7).default(4) });
export const WindCompassProps = z.object({ ...geo });
export const UvIndexProps = z.object({ ...geo });
export const AirQualityProps = z.object({ ...geo });
export const PrecipProps = z.object({ ...geo });
export const HeadlinesProps = z.object({ url: httpUrl, max: z.number().int().min(1).max(12).default(5), label: line(40).default("Headlines") });
export const CurrencyRateProps = z.object({ from: line(6).default("USD"), to: line(6).default("INR"), label: line(40).default("") });
export const CryptoPriceProps = z.object({ coin: line(40).default("bitcoin"), vs: line(6).default("usd"), label: line(40).default("") });
export const OnThisDayProps = z.object({ max: z.number().int().min(1).max(8).default(4), label: line(40).default("On this day") });
export const WikiTodayProps = z.object({ title: line(120).default(""), label: line(40).default("From Wikipedia") });
export const QuoteLiveProps = z.object({ label: line(40).default("") });
export const FactLiveProps = z.object({ label: line(40).default("Did you know") });
export const HackerNewsProps = z.object({ max: z.number().int().min(1).max(10).default(5), label: line(40).default("Hacker News") });
export const GithubStatsProps = z.object({ user: line(60).default("torvalds"), repo: line(80).default(""), label: line(40).default("") });
export const NextHolidayProps = z.object({ country: line(2).default("IN"), label: line(40).default("Next holiday") });
export const IssNowProps = z.object({ label: line(40).default("ISS now") });

// Point this at any JSON or RSS URL; the server polls it and renders the
// template (one line per row; {{dotted.path}} → field, {{items.0.title}} → array).
export const JsonFeedProps = z.object({
  url: httpUrl,
  template: line(800).default("{{title}}\n{{value}}"),
  label: line(40).default(""),
  refreshSeconds: z.number().int().min(30).max(86400).default(900),
});

// v3.0 reactive: shows a value from the per-user custom-data store (written by the
// API / webhooks / automations), looked up by `key`.
export const CustomDataProps = z.object({
  key: line(100).default(""),
  label: line(60).default(""),
  format: z.enum(["text", "number", "json"]).default("text"),
});

// ===== v0.8 blocks: text & structure =====
export const SignatureProps = z.object({ name: line(60).default("Your Name"), role: line(60).default("") });
export const AddressProps = z.object({ content: line(300).default("221B Baker Street\nLondon NW1\nUnited Kingdom") });
export const BylineProps = z.object({ author: line(60).default("Author"), date: line(40).default("Today") });
export const LegendProps = z.object({ items: line(400).default("● Open\n○ Closed\n◐ Partial") });
export const BreadcrumbProps = z.object({ path: line(200).default("Home / Section / Page") });
export const NoticeBarProps = z.object({ content: line(200).default("Heads up — something to know."), icon: line(8).default("⚠") });
export const KeyComboProps = z.object({ keys: line(80).default("Cmd S"), label: line(60).default("") });
export const DividerLabeledProps = z.object({ label: line(60).default("SECTION") });

// ===== v0.8 blocks: visual & layout =====
export const IconRowProps = z.object({ symbols: line(120).default("★ ☀ ☾ ✶ ◆") });
export const StatRowProps = z.object({ items: line(400).default("12 | Sales\n89% | Uptime\n4.8 | Rating") });
export const SpacerDotsProps = z.object({});
export const FrameProps = z.object({ label: line(40).default("NOTE"), content: line(300).default("Framed content.") });

// ===== v0.8 blocks: charts =====
export const LineChartProps = z.object({ values: line(400).default("3,5,4,6,7,6,8,7,9,8,10"), label: line(60).default("") });
export const AreaChartProps = z.object({ values: line(400).default("3,5,4,6,7,6,8,7,9"), label: line(60).default("") });
export const BulletGraphProps = z.object({ value: z.number().default(72), target: z.number().default(80), label: line(60).default("") });
export const HorizontalBarsProps = z.object({ items: line(600).default("Mon | 8\nTue | 5\nWed | 9\nThu | 6") });
export const RankingListProps = z.object({ items: line(600).default("Alice | 92\nBob | 85\nCara | 78") });
export const WaffleProps = z.object({ value: z.number().min(0).max(100).default(64), label: line(60).default("") });
export const SignalBarsProps = z.object({ value: z.number().int().min(0).max(5).default(3), label: line(60).default("Signal") });
export const ThermometerProps = z.object({ value: z.number().default(22), min: z.number().default(0), max: z.number().default(40), unit: line(8).default("°"), label: line(60).default("") });
export const ComparisonProps = z.object({ leftLabel: line(30).default("A"), leftValue: z.number().default(60), rightLabel: line(30).default("B"), rightValue: z.number().default(40) });
export const PercentListProps = z.object({ items: line(400).default("Design | 40\nDev | 35\nQA | 25") });

// ===== v0.8 blocks: time & calendar (computed) =====
export const MonthCalendarProps = z.object({ label: line(40).default("") });
export const WeekStripProps = z.object({ label: line(40).default("") });
export const NowNextProps = z.object({ items: line(600).default("09:00 | Standup\n12:30 | Lunch\n16:00 | Review") });
export const AgeCounterProps = z.object({ since: z.string().default("2000-01-01"), label: line(60).default("Age") });
export const AnniversaryProps = z.object({ date: z.string().default("2020-06-13"), label: line(60).default("Anniversary") });
export const TimeBlocksProps = z.object({ items: line(600).default("09–10 | Focus\n10–11 | Email\n11–13 | Build") });
export const ShiftStatusProps = z.object({ open: z.number().int().min(0).max(23).default(9), close: z.number().int().min(0).max(24).default(17), label: line(60).default("") });
export const PomodoroProps = z.object({ workMin: z.number().int().min(1).max(180).default(25), breakMin: z.number().int().min(1).max(60).default(5), label: line(40).default("") });

// ===== v0.8 blocks: trackers =====
export const MonthHabitProps = z.object({ label: line(60).default("This month"), days: line(200).default("x x . x x . . x x x . x") });
export const SavingsGoalProps = z.object({ saved: z.number().default(6500), target: z.number().default(10000), unit: line(8).default("₹"), label: line(60).default("Savings") });
export const ReadingNowProps = z.object({ title: line(80).default("A Calm Book"), author: line(60).default("Anon"), percent: z.number().min(0).max(100).default(45) });
export const WeightTrendProps = z.object({ values: line(400).default("72,71.6,71.4,71,70.8"), unit: line(8).default("kg"), label: line(60).default("Weight") });
export const MoodWeekProps = z.object({ moods: line(80).default("🙂 😐 🙂 😀 😐 🙁 🙂") });
export const ChecklistProgressProps = z.object({ items: line(600).default("x Ship\nx Test\nWrite docs\nCelebrate"), label: line(60).default("Tasks") });

// ===== v0.8 blocks: signage & office =====
export const RoomStatusProps = z.object({ room: line(60).default("Room 3"), status: z.enum(["free", "busy"]).default("free") });
export const DirectoryProps = z.object({ items: line(600).default("Dr. Rao | Room 3\nReception | Floor 1\nPharmacy | Floor 2") });
export const EventBannerProps = z.object({ title: line(80).default("Annual Meetup"), when: line(60).default("Sat 6 PM · Hall A") });
export const OpenSignProps = z.object({ open: z.boolean().default(true), label: line(40).default("") });
export const NowPlayingProps = z.object({ title: line(80).default("Quiet Song"), artist: line(60).default("Someone") });
export const SplitFlapProps = z.object({ text: line(40).default("DEPARTURES") });

// ===== v0.9 blocks: 60 more (all computed/prop, offline-safe) =====
// text & structure
export const EpigraphProps = z.object({ content: line(300).default("We shape our tools, and thereafter our tools shape us."), author: line(80).default("M. McLuhan") });
export const KickerProps = z.object({ kicker: line(60).default("FEATURED"), title: line(120).default("The headline goes here") });
export const TickerProps = z.object({ content: line(200).default("Calm news · quiet updates · nothing urgent") });
export const GlossaryProps = z.object({ items: line(1000).default("Glance | a two-second read\nCalm | no notifications\nBoard | one screen's layout") });
export const FootnotesProps = z.object({ items: line(800).default("Prices include tax.\nSubject to availability.\nMIT licensed.") });
export const HighlightProps = z.object({ content: line(300).default("The one thing worth remembering today.") });
export const LetterheadProps = z.object({ name: line(60).default("Your Name"), tagline: line(80).default("Calm by design") });
export const FieldRowProps = z.object({ label: line(60).default("Status"), value: line(120).default("On track") });
export const ContentsProps = z.object({ items: line(1000).default("Introduction\nThe idea\nHow it works\nRunning it") });
export const AsideProps = z.object({ content: line(300).default("A quiet note set off to the side.") });
export const PostscriptProps = z.object({ content: line(200).default("One more small thing worth knowing.") });
export const MantraProps = z.object({ content: line(120).default("Look, understand, move on.") });
// media & identity
export const EmojiStatProps = z.object({ emoji: z.string().max(8).default("✨"), label: line(60).default("") });
export const MonogramProps = z.object({ letters: line(8).default("GO"), label: line(60).default("") });
export const FlagProps = z.object({ emoji: z.string().max(8).default("🏳"), label: line(60).default("Country") });
export const LogoTextProps = z.object({ text: line(40).default("GLANCE") });
export const ProfileCardProps = z.object({ name: line(60).default("Your Name"), role: line(60).default("Title"), detail: line(120).default("A short line about you.") });
export const PeopleListProps = z.object({ items: line(600).default("Dr. Rao | Cardiology\nA. Smith | Reception\nJ. Lee | Pharmacy") });
// numbers
export const BigNumberProps = z.object({ value: line(20).default("42"), caption: line(60).default("the answer") });
export const PercentBigProps = z.object({ value: z.number().min(0).max(100).default(72), label: line(60).default("") });
export const DeltaStatProps = z.object({ value: line(20).default("1,284"), delta: line(16).default("+12%"), label: line(60).default("Visitors") });
export const MoneyStatProps = z.object({ amount: line(20).default("12,500"), currency: line(8).default("₹"), label: line(60).default("Revenue") });
export const CounterPairProps = z.object({ leftLabel: line(30).default("In"), leftValue: line(12).default("24"), rightLabel: line(30).default("Out"), rightValue: line(12).default("18") });
export const TargetMeterProps = z.object({ value: z.number().default(72), target: z.number().default(100), unit: line(8).default(""), label: line(60).default("Goal") });
export const UnitStatProps = z.object({ value: line(20).default("36.6"), unit: line(12).default("°C"), label: line(60).default("Temperature") });
export const ProgressBarsProps = z.object({ items: line(600).default("Design | 80\nDev | 55\nQA | 30") });
// charts
export const LollipopChartProps = z.object({ items: line(600).default("Mon | 8\nTue | 5\nWed | 9\nThu | 6") });
export const WinLossBarProps = z.object({ values: line(400).default("1,1,-1,1,0,-1,1,1"), label: line(60).default("") });
export const DotMatrixProps = z.object({ value: z.number().int().min(0).max(100).default(36), total: z.number().int().min(1).max(100).default(50), label: line(60).default("") });
export const RangeBarProps = z.object({ min: z.number().default(0), max: z.number().default(100), value: z.number().default(64), label: line(60).default("") });
export const BubbleScaleProps = z.object({ items: line(400).default("A | 8\nB | 4\nC | 6\nD | 2") });
export const StarBarProps = z.object({ value: z.number().min(0).max(20).default(7), max: z.number().int().min(1).max(20).default(10), label: line(60).default("") });
export const ColumnLabelsProps = z.object({ items: line(600).default("Q1 | 12\nQ2 | 18\nQ3 | 9\nQ4 | 21") });
export const DeltaListProps = z.object({ items: line(600).default("Sales | +12\nCosts | -4\nUsers | +8") });
export const GaugeMiniProps = z.object({ value: z.number().min(0).max(100).default(64), label: line(60).default("") });
export const HistogramProps = z.object({ values: line(400).default("2,4,7,9,6,3,5,8,4,2"), label: line(60).default("") });
// time (computed)
export const FullDateProps = z.object({ label: line(40).default("") });
export const MonthNameProps = z.object({ label: line(40).default("") });
export const TimeOfDayProps = z.object({ label: line(40).default("") });
export const QuarterProgressProps = z.object({ label: line(60).default("Quarter") });
export const DaysLeftMonthProps = z.object({ label: line(60).default("") });
export const UnixClockProps = z.object({ label: line(40).default("Unix") });
export const TzPairProps = z.object({ labelA: line(40).default("NYC"), tzA: line(64).default("America/New_York"), labelB: line(40).default("Tokyo"), tzB: line(64).default("Asia/Tokyo") });
export const NextWeekdayProps = z.object({ weekday: z.number().int().min(0).max(6).default(1), label: line(60).default("") });
// nature (computed)
export const DaylightProps = z.object({ ...geo });
export const MoonProgressProps = z.object({ label: line(40).default("") });
export const SeasonProgressProps = z.object({ hemisphere: z.enum(["north", "south"]).default("north"), label: line(40).default("Season") });
export const GoldenHourProps = z.object({ ...geo });
// trackers
export const GoalProgressProps = z.object({ value: z.number().default(6), target: z.number().default(10), unit: line(8).default(""), label: line(60).default("Goal") });
export const StepsTodayProps = z.object({ value: z.number().default(6400), goal: z.number().default(10000), label: line(60).default("Steps") });
export const StreakPairProps = z.object({ current: z.number().int().min(0).max(99999).default(12), best: z.number().int().min(0).max(99999).default(48), label: line(60).default("Streak") });
export const BookListProps = z.object({ items: line(600).default("A Calm Book | Anon\nDeep Work | C. Newport\nSilence | E. Prochnik") });
export const MoodTodayProps = z.object({ emoji: z.string().max(8).default("🙂"), label: line(60).default("Today") });
export const BudgetLineProps = z.object({ spent: z.number().default(6500), budget: z.number().default(10000), unit: line(8).default("₹"), label: line(60).default("Budget") });
// info & signage
export const WelcomeSignProps = z.object({ name: line(60).default("Guest"), message: line(80).default("Welcome") });
export const PriceTagProps = z.object({ item: line(60).default("Espresso"), price: line(16).default("120"), unit: line(8).default("₹") });
export const TodaySpecialProps = z.object({ title: line(80).default("Today's Special"), detail: line(120).default("Saffron risotto · 320") });
export const PhoneNumberProps = z.object({ label: line(40).default("Reception"), number: line(40).default("+91 98765 43210") });
export const SocialHandleProps = z.object({ platform: line(40).default("Instagram"), handle: line(60).default("@glanceos") });
export const WayfindingProps = z.object({ items: line(600).default("Reception | → Floor 1\nPharmacy | → Floor 2\nExit | ← Left") });

// ===== v4.7: self-running time objects (client-tick, no server state) =====
export const StopwatchProps = z.object({ label: line(40).default("Elapsed"), since: z.string().default("2026-01-01T09:00"), showSeconds: z.boolean().default(true) });
export const LiveCounterProps = z.object({ label: line(40).default(""), start: z.number().default(0), perDay: z.number().default(1440), since: z.string().default("2026-01-01"), unit: line(12).default(""), decimals: z.number().int().min(0).max(4).default(0) });
export const OnAirProps = z.object({ label: line(40).default(""), start: z.number().min(0).max(24).default(9), end: z.number().min(0).max(24).default(17), onText: line(20).default("ON AIR"), offText: line(20).default("OFF AIR") });
// v5.0 time/place — agenda objects. Work from typed `items` (HH:MM | Title | Location)
// offline; when bound to a calendar source the live events override.
export const UpNextProps = z.object({ label: line(40).default("Up next"), items: line(800).default("09:00 | Standup | Room 3\n12:30 | Lunch\n16:00 | Review | Zoom") });
export const DayTimelineProps = z.object({ label: line(40).default(""), items: line(1200).default("09:00 | Standup\n12:30 | Lunch\n14:00 | Focus block\n16:00 | Review"), max: z.number().int().min(1).max(20).default(8) });
// v7.0 calm-glance — the single "one thing now" hero (current event, else next).
export const FocusNowProps = z.object({ label: line(40).default(""), items: line(800).default("09:00 | Standup | Room 3\n12:30 | Lunch\n16:00 | Review | Zoom") });
// v7.0 calm-glance — "leave by": next event minus your own travel time (no geocoding;
// you state the minutes). Binds to a calendar source like the agenda blocks.
export const LeaveByProps = z.object({ label: line(40).default("Leave by"), items: line(800).default("09:00 | Standup | Room 3\n12:30 | Lunch\n16:00 | Review | Zoom"), travelMinutes: z.number().int().min(0).max(240).default(15) });
// "What changed since you last looked" — a calm digest of meaningful deltas across the
// board's other blocks since the previous render (the server diffs and fills it in;
// offline / on the first look it shows a placeholder). `title` heads the list; `max` caps rows.
export const SinceYouLookedProps = z.object({ title: line(40).default("Since you looked"), max: z.number().int().min(1).max(12).default(5) });
// v5.0 ambient / self / home fusion objects.
export const MyDayProps = z.object({ name: line(40).default(""), subtitle: line(140).default("Have a calm, focused day."), showDate: z.boolean().default(true) });
// #148 — Daily brief: the server composes today's greeting + date + weather + the next few
// calendar events + a couple of undone tasks into one calm morning summary (rule-based, no AI).
export const DailyBriefProps = z.object({
  title: line(40).default("Today"),
  showDate: z.boolean().default(true),
  showWeather: z.boolean().default(true),
  maxEvents: z.number().int().min(0).max(5).default(3),
  maxTasks: z.number().int().min(0).max(5).default(2),
});
export const HealthRingProps = z.object({ label: line(40).default("Steps"), value: z.number().default(6200), goal: z.number().min(1).default(10000), unit: line(12).default("") });
export const HomeTileProps = z.object({ label: line(40).default("Living room"), icon: line(8).default("⌂"), value: line(40).default("21"), unit: line(12).default("°C") });
export const SunArcProps = z.object({ latitude: z.number().default(28.6139), longitude: z.number().default(77.209), label: line(40).default("") });
export const NextFullMoonProps = z.object({ label: line(40).default("") });

// ===== v1.0: data binding (optional, on every block) =====
// A block can point a prop (or its whole data) at a live SOURCE instead of typed
// props. Reuses jsonFeed's {{dotted.path}} extraction grammar so the mental model
// is identical. `.optional()` keeps unbound blocks byte-identical → no migration.
export const SourceMap = z.object({
  path: z.string().max(400).default(""), // scalar/object path, e.g. "data.today.total"
  items: z.string().max(400).optional(), // array path for a list/series, e.g. "results"
  fields: z.record(z.string(), z.string().max(400)).optional(), // per-leaf rename: {value:"count", label:"date"}
  // v6.1 adds round/currency/duration/rangeToWords — pure, total scalar shapers so a raw
  // API number reads as a calm human phrase. `transformArg` carries their parameter
  // (decimals / currency symbol / "33,67:low,medium,high"). All optional → no migration.
  transform: z.enum(["none", "series", "count", "sum", "first", "last", "join", "percent", "round", "currency", "duration", "rangeToWords"]).default("none"),
  transformArg: z.string().max(120).optional(),
}).prefault({});
export type SourceMapT = z.infer<typeof SourceMap>;

export const BlockSource = z.object({
  connectionId: z.string().min(1).optional(), // FK → a saved connection (decrypted server-side); absent = anonymous URL
  kind: z.string().min(1).max(64), // resolver id: "rest" | "ical.events" | "todoist.tasks" | ...
  query: z.record(z.string(), z.string().max(2000)).prefault({}), // resolver params: {url, project_id, repo, ...}
  map: SourceMap,
  refreshSeconds: z.number().int().min(30).max(86400).optional(),
});
export type BlockSourceT = z.infer<typeof BlockSource>;

// v8.0 — a deck/slideshow object: rotates through text slides on its own timer (deterministic
// from the wall clock, so multiple screens flip in lockstep). Slides are separated by a blank
// line, so each may be multi-line. Drop one into any grid cell to make that section rotate.
export const DeckProps = z.object({
  slides: line(2000).default("First slide\n\nSecond slide\n\nThird slide"),
  seconds: z.number().int().min(2).max(600).default(8),
});

// `visibleWhen` (#50): show the block only when its effective value passes a comparison
// (e.g. hide a "low stock" warning until count < 5). Additive + optional → old docs render
// unchanged. Evaluated on the screen against the block's resolved scalar, else its prop.
const VisibleWhen = z.object({
  op: z.enum(["gt", "gte", "lt", "lte", "eq", "ne", "empty", "nonempty"]),
  value: z.union([z.number(), z.string()]).optional(),
});
const b = { id: z.string().min(1), name: line(60).optional(), hidden: z.boolean().optional(), locked: z.boolean().optional(), width: z.number().min(0.2).max(5).default(1), style: BlockStyle.prefault({}), source: BlockSource.optional(), visibility: z.enum(["always", "whenData"]).optional(), visibleWhen: VisibleWhen.optional(), fallback: line(120).optional(), focusHide: z.boolean().optional() };

export const Widget = z.discriminatedUnion("type", [
  z.object({ ...b, type: z.literal("clock"), props: ClockProps }),
  z.object({ ...b, type: z.literal("weather"), props: WeatherProps }),
  z.object({ ...b, type: z.literal("calendar"), props: CalendarProps }),
  z.object({ ...b, type: z.literal("tasks"), props: TasksProps }),
  z.object({ ...b, type: z.literal("text"), props: TextProps }),
  z.object({ ...b, type: z.literal("queue"), props: QueueProps }),
  z.object({ ...b, type: z.literal("heading"), props: HeadingProps }),
  z.object({ ...b, type: z.literal("divider"), props: DividerProps }),
  z.object({ ...b, type: z.literal("image"), props: ImageProps }),
  z.object({ ...b, type: z.literal("callout"), props: CalloutProps }),
  z.object({ ...b, type: z.literal("subheading"), props: SubheadingProps }),
  z.object({ ...b, type: z.literal("quote"), props: QuoteProps }),
  z.object({ ...b, type: z.literal("bulletList"), props: BulletListProps }),
  z.object({ ...b, type: z.literal("numberedList"), props: NumberedListProps }),
  z.object({ ...b, type: z.literal("checklist"), props: ChecklistProps }),
  z.object({ ...b, type: z.literal("code"), props: CodeProps }),
  z.object({ ...b, type: z.literal("label"), props: LabelProps }),
  z.object({ ...b, type: z.literal("keyValue"), props: KeyValueProps }),
  z.object({ ...b, type: z.literal("table"), props: TableProps }),
  z.object({ ...b, type: z.literal("link"), props: LinkProps }),
  z.object({ ...b, type: z.literal("banner"), props: BannerProps }),
  z.object({ ...b, type: z.literal("definition"), props: DefinitionProps }),
  z.object({ ...b, type: z.literal("spacer"), props: SpacerProps }),
  z.object({ ...b, type: z.literal("stat"), props: StatProps }),
  z.object({ ...b, type: z.literal("metric"), props: MetricProps }),
  z.object({ ...b, type: z.literal("progress"), props: ProgressProps }),
  z.object({ ...b, type: z.literal("rating"), props: RatingProps }),
  z.object({ ...b, type: z.literal("gauge"), props: GaugeProps }),
  z.object({ ...b, type: z.literal("worldClock"), props: WorldClockProps }),
  z.object({ ...b, type: z.literal("countdown"), props: CountdownProps }),
  z.object({ ...b, type: z.literal("daysUntil"), props: DaysUntilProps }),
  z.object({ ...b, type: z.literal("weekNumber"), props: WeekNumberProps }),
  z.object({ ...b, type: z.literal("dateBadge"), props: DateBadgeProps }),
  z.object({ ...b, type: z.literal("timer"), props: TimerProps }),
  z.object({ ...b, type: z.literal("analogClock"), props: AnalogClockProps }),
  z.object({ ...b, type: z.literal("moonPhase"), props: MoonPhaseProps }),
  z.object({ ...b, type: z.literal("sunriseSunset"), props: SunriseSunsetProps }),
  z.object({ ...b, type: z.literal("icon"), props: IconProps }),
  z.object({ ...b, type: z.literal("avatar"), props: AvatarProps }),
  z.object({ ...b, type: z.literal("badge"), props: BadgeProps }),
  z.object({ ...b, type: z.literal("nameTag"), props: NameTagProps }),
  z.object({ ...b, type: z.literal("hours"), props: HoursProps }),
  z.object({ ...b, type: z.literal("menuList"), props: MenuListProps }),
  z.object({ ...b, type: z.literal("deviceStatus"), props: DeviceStatusProps }),
  z.object({ ...b, type: z.literal("sensor"), props: SensorProps }),
  z.object({ ...b, type: z.literal("thermostat"), props: ThermostatProps }),
  // v0.6 text & structure
  z.object({ ...b, type: z.literal("lead"), props: LeadProps }),
  z.object({ ...b, type: z.literal("pullquote"), props: PullquoteProps }),
  z.object({ ...b, type: z.literal("dropCap"), props: DropCapProps }),
  z.object({ ...b, type: z.literal("finePrint"), props: FinePrintProps }),
  z.object({ ...b, type: z.literal("numberedHeading"), props: NumberedHeadingProps }),
  z.object({ ...b, type: z.literal("verse"), props: VerseProps }),
  z.object({ ...b, type: z.literal("ascii"), props: AsciiProps }),
  z.object({ ...b, type: z.literal("tagCloud"), props: TagCloudProps }),
  z.object({ ...b, type: z.literal("timeline"), props: TimelineProps }),
  z.object({ ...b, type: z.literal("steps"), props: StepsProps }),
  z.object({ ...b, type: z.literal("faq"), props: FaqProps }),
  z.object({ ...b, type: z.literal("prosCons"), props: ProsConsProps }),
  // v0.6 charts
  z.object({ ...b, type: z.literal("sparkline"), props: SparklineProps }),
  z.object({ ...b, type: z.literal("barChart"), props: BarChartProps }),
  z.object({ ...b, type: z.literal("progressRing"), props: ProgressRingProps }),
  z.object({ ...b, type: z.literal("dotProgress"), props: DotProgressProps }),
  z.object({ ...b, type: z.literal("scoreboard"), props: ScoreboardProps }),
  z.object({ ...b, type: z.literal("fraction"), props: FractionProps }),
  z.object({ ...b, type: z.literal("tally"), props: TallyProps }),
  z.object({ ...b, type: z.literal("heatStrip"), props: HeatStripProps }),
  z.object({ ...b, type: z.literal("trend"), props: TrendProps }),
  z.object({ ...b, type: z.literal("kpiSpark"), props: KpiSparkProps }),
  // v0.6 time computed
  z.object({ ...b, type: z.literal("dayProgress"), props: DayProgressProps }),
  z.object({ ...b, type: z.literal("yearProgress"), props: YearProgressProps }),
  z.object({ ...b, type: z.literal("weekProgress"), props: WeekProgressProps }),
  z.object({ ...b, type: z.literal("greeting"), props: GreetingProps }),
  z.object({ ...b, type: z.literal("romanClock"), props: RomanClockProps }),
  z.object({ ...b, type: z.literal("binaryClock"), props: BinaryClockProps }),
  z.object({ ...b, type: z.literal("seasonClock"), props: SeasonClockProps }),
  z.object({ ...b, type: z.literal("zodiac"), props: ZodiacProps }),
  // v0.6 trackers & cards
  z.object({ ...b, type: z.literal("habitTracker"), props: HabitTrackerProps }),
  z.object({ ...b, type: z.literal("streak"), props: StreakProps }),
  z.object({ ...b, type: z.literal("waterTracker"), props: WaterTrackerProps }),
  z.object({ ...b, type: z.literal("wifiCard"), props: WifiCardProps }),
  // v0.6 live
  z.object({ ...b, type: z.literal("forecast"), props: ForecastProps }),
  z.object({ ...b, type: z.literal("windCompass"), props: WindCompassProps }),
  z.object({ ...b, type: z.literal("uvIndex"), props: UvIndexProps }),
  z.object({ ...b, type: z.literal("airQuality"), props: AirQualityProps }),
  z.object({ ...b, type: z.literal("precip"), props: PrecipProps }),
  z.object({ ...b, type: z.literal("headlines"), props: HeadlinesProps }),
  z.object({ ...b, type: z.literal("currencyRate"), props: CurrencyRateProps }),
  z.object({ ...b, type: z.literal("cryptoPrice"), props: CryptoPriceProps }),
  z.object({ ...b, type: z.literal("onThisDay"), props: OnThisDayProps }),
  z.object({ ...b, type: z.literal("wikiToday"), props: WikiTodayProps }),
  z.object({ ...b, type: z.literal("quoteLive"), props: QuoteLiveProps }),
  z.object({ ...b, type: z.literal("factLive"), props: FactLiveProps }),
  z.object({ ...b, type: z.literal("hackerNews"), props: HackerNewsProps }),
  z.object({ ...b, type: z.literal("githubStats"), props: GithubStatsProps }),
  z.object({ ...b, type: z.literal("nextHoliday"), props: NextHolidayProps }),
  z.object({ ...b, type: z.literal("issNow"), props: IssNowProps }),
  z.object({ ...b, type: z.literal("jsonFeed"), props: JsonFeedProps }),
  z.object({ ...b, type: z.literal("customData"), props: CustomDataProps }),
  // v0.8 text & structure
  z.object({ ...b, type: z.literal("signature"), props: SignatureProps }),
  z.object({ ...b, type: z.literal("address"), props: AddressProps }),
  z.object({ ...b, type: z.literal("byline"), props: BylineProps }),
  z.object({ ...b, type: z.literal("legend"), props: LegendProps }),
  z.object({ ...b, type: z.literal("breadcrumb"), props: BreadcrumbProps }),
  z.object({ ...b, type: z.literal("noticeBar"), props: NoticeBarProps }),
  z.object({ ...b, type: z.literal("keyCombo"), props: KeyComboProps }),
  z.object({ ...b, type: z.literal("dividerLabeled"), props: DividerLabeledProps }),
  // v0.8 visual & layout
  z.object({ ...b, type: z.literal("iconRow"), props: IconRowProps }),
  z.object({ ...b, type: z.literal("statRow"), props: StatRowProps }),
  z.object({ ...b, type: z.literal("spacerDots"), props: SpacerDotsProps }),
  z.object({ ...b, type: z.literal("frame"), props: FrameProps }),
  // v0.8 charts
  z.object({ ...b, type: z.literal("lineChart"), props: LineChartProps }),
  z.object({ ...b, type: z.literal("areaChart"), props: AreaChartProps }),
  z.object({ ...b, type: z.literal("bulletGraph"), props: BulletGraphProps }),
  z.object({ ...b, type: z.literal("horizontalBars"), props: HorizontalBarsProps }),
  z.object({ ...b, type: z.literal("rankingList"), props: RankingListProps }),
  z.object({ ...b, type: z.literal("waffle"), props: WaffleProps }),
  z.object({ ...b, type: z.literal("signalBars"), props: SignalBarsProps }),
  z.object({ ...b, type: z.literal("thermometer"), props: ThermometerProps }),
  z.object({ ...b, type: z.literal("comparison"), props: ComparisonProps }),
  z.object({ ...b, type: z.literal("percentList"), props: PercentListProps }),
  // v0.8 time & calendar
  z.object({ ...b, type: z.literal("monthCalendar"), props: MonthCalendarProps }),
  z.object({ ...b, type: z.literal("weekStrip"), props: WeekStripProps }),
  z.object({ ...b, type: z.literal("nowNext"), props: NowNextProps }),
  z.object({ ...b, type: z.literal("ageCounter"), props: AgeCounterProps }),
  z.object({ ...b, type: z.literal("anniversary"), props: AnniversaryProps }),
  z.object({ ...b, type: z.literal("timeBlocks"), props: TimeBlocksProps }),
  z.object({ ...b, type: z.literal("shiftStatus"), props: ShiftStatusProps }),
  z.object({ ...b, type: z.literal("pomodoro"), props: PomodoroProps }),
  // v0.8 trackers
  z.object({ ...b, type: z.literal("monthHabit"), props: MonthHabitProps }),
  z.object({ ...b, type: z.literal("savingsGoal"), props: SavingsGoalProps }),
  z.object({ ...b, type: z.literal("readingNow"), props: ReadingNowProps }),
  z.object({ ...b, type: z.literal("weightTrend"), props: WeightTrendProps }),
  z.object({ ...b, type: z.literal("moodWeek"), props: MoodWeekProps }),
  z.object({ ...b, type: z.literal("checklistProgress"), props: ChecklistProgressProps }),
  // v0.8 signage & office
  z.object({ ...b, type: z.literal("roomStatus"), props: RoomStatusProps }),
  z.object({ ...b, type: z.literal("directory"), props: DirectoryProps }),
  z.object({ ...b, type: z.literal("eventBanner"), props: EventBannerProps }),
  z.object({ ...b, type: z.literal("openSign"), props: OpenSignProps }),
  z.object({ ...b, type: z.literal("nowPlaying"), props: NowPlayingProps }),
  z.object({ ...b, type: z.literal("splitFlap"), props: SplitFlapProps }),
  // v0.9 text & structure
  z.object({ ...b, type: z.literal("epigraph"), props: EpigraphProps }),
  z.object({ ...b, type: z.literal("kicker"), props: KickerProps }),
  z.object({ ...b, type: z.literal("ticker"), props: TickerProps }),
  z.object({ ...b, type: z.literal("glossary"), props: GlossaryProps }),
  z.object({ ...b, type: z.literal("footnotes"), props: FootnotesProps }),
  z.object({ ...b, type: z.literal("highlight"), props: HighlightProps }),
  z.object({ ...b, type: z.literal("letterhead"), props: LetterheadProps }),
  z.object({ ...b, type: z.literal("fieldRow"), props: FieldRowProps }),
  z.object({ ...b, type: z.literal("contents"), props: ContentsProps }),
  z.object({ ...b, type: z.literal("aside"), props: AsideProps }),
  z.object({ ...b, type: z.literal("postscript"), props: PostscriptProps }),
  z.object({ ...b, type: z.literal("mantra"), props: MantraProps }),
  // v0.9 media & identity
  z.object({ ...b, type: z.literal("emojiStat"), props: EmojiStatProps }),
  z.object({ ...b, type: z.literal("monogram"), props: MonogramProps }),
  z.object({ ...b, type: z.literal("flag"), props: FlagProps }),
  z.object({ ...b, type: z.literal("logoText"), props: LogoTextProps }),
  z.object({ ...b, type: z.literal("profileCard"), props: ProfileCardProps }),
  z.object({ ...b, type: z.literal("peopleList"), props: PeopleListProps }),
  // v0.9 numbers
  z.object({ ...b, type: z.literal("bigNumber"), props: BigNumberProps }),
  z.object({ ...b, type: z.literal("percentBig"), props: PercentBigProps }),
  z.object({ ...b, type: z.literal("deltaStat"), props: DeltaStatProps }),
  z.object({ ...b, type: z.literal("moneyStat"), props: MoneyStatProps }),
  z.object({ ...b, type: z.literal("counterPair"), props: CounterPairProps }),
  z.object({ ...b, type: z.literal("targetMeter"), props: TargetMeterProps }),
  z.object({ ...b, type: z.literal("unitStat"), props: UnitStatProps }),
  z.object({ ...b, type: z.literal("progressBars"), props: ProgressBarsProps }),
  // v0.9 charts
  z.object({ ...b, type: z.literal("lollipopChart"), props: LollipopChartProps }),
  z.object({ ...b, type: z.literal("winLossBar"), props: WinLossBarProps }),
  z.object({ ...b, type: z.literal("dotMatrix"), props: DotMatrixProps }),
  z.object({ ...b, type: z.literal("rangeBar"), props: RangeBarProps }),
  z.object({ ...b, type: z.literal("bubbleScale"), props: BubbleScaleProps }),
  z.object({ ...b, type: z.literal("starBar"), props: StarBarProps }),
  z.object({ ...b, type: z.literal("columnLabels"), props: ColumnLabelsProps }),
  z.object({ ...b, type: z.literal("deltaList"), props: DeltaListProps }),
  z.object({ ...b, type: z.literal("gaugeMini"), props: GaugeMiniProps }),
  z.object({ ...b, type: z.literal("histogram"), props: HistogramProps }),
  // v0.9 time computed
  z.object({ ...b, type: z.literal("fullDate"), props: FullDateProps }),
  z.object({ ...b, type: z.literal("monthName"), props: MonthNameProps }),
  z.object({ ...b, type: z.literal("timeOfDay"), props: TimeOfDayProps }),
  z.object({ ...b, type: z.literal("quarterProgress"), props: QuarterProgressProps }),
  z.object({ ...b, type: z.literal("daysLeftMonth"), props: DaysLeftMonthProps }),
  z.object({ ...b, type: z.literal("unixClock"), props: UnixClockProps }),
  z.object({ ...b, type: z.literal("tzPair"), props: TzPairProps }),
  z.object({ ...b, type: z.literal("nextWeekday"), props: NextWeekdayProps }),
  // v0.9 nature computed
  z.object({ ...b, type: z.literal("daylight"), props: DaylightProps }),
  z.object({ ...b, type: z.literal("moonProgress"), props: MoonProgressProps }),
  z.object({ ...b, type: z.literal("seasonProgress"), props: SeasonProgressProps }),
  z.object({ ...b, type: z.literal("goldenHour"), props: GoldenHourProps }),
  // v0.9 trackers
  z.object({ ...b, type: z.literal("goalProgress"), props: GoalProgressProps }),
  z.object({ ...b, type: z.literal("stepsToday"), props: StepsTodayProps }),
  z.object({ ...b, type: z.literal("streakPair"), props: StreakPairProps }),
  z.object({ ...b, type: z.literal("bookList"), props: BookListProps }),
  z.object({ ...b, type: z.literal("moodToday"), props: MoodTodayProps }),
  z.object({ ...b, type: z.literal("budgetLine"), props: BudgetLineProps }),
  // v0.9 info & signage
  z.object({ ...b, type: z.literal("welcomeSign"), props: WelcomeSignProps }),
  z.object({ ...b, type: z.literal("priceTag"), props: PriceTagProps }),
  z.object({ ...b, type: z.literal("todaySpecial"), props: TodaySpecialProps }),
  z.object({ ...b, type: z.literal("phoneNumber"), props: PhoneNumberProps }),
  z.object({ ...b, type: z.literal("socialHandle"), props: SocialHandleProps }),
  z.object({ ...b, type: z.literal("wayfinding"), props: WayfindingProps }),
  // v4.7 self-running time objects
  z.object({ ...b, type: z.literal("stopwatch"), props: StopwatchProps }),
  z.object({ ...b, type: z.literal("liveCounter"), props: LiveCounterProps }),
  // v4.7 new auto objects
  z.object({ ...b, type: z.literal("onAir"), props: OnAirProps }),
  z.object({ ...b, type: z.literal("sunArc"), props: SunArcProps }),
  z.object({ ...b, type: z.literal("nextFullMoon"), props: NextFullMoonProps }),
  // v5.0 time/place agenda objects
  z.object({ ...b, type: z.literal("upNext"), props: UpNextProps }),
  z.object({ ...b, type: z.literal("dayTimeline"), props: DayTimelineProps }),
  z.object({ ...b, type: z.literal("focusNow"), props: FocusNowProps }),
  z.object({ ...b, type: z.literal("leaveBy"), props: LeaveByProps }),
  z.object({ ...b, type: z.literal("sinceYouLooked"), props: SinceYouLookedProps }),
  // v5.0 ambient / self / home objects
  z.object({ ...b, type: z.literal("myDay"), props: MyDayProps }),
  z.object({ ...b, type: z.literal("dailyBrief"), props: DailyBriefProps }),
  z.object({ ...b, type: z.literal("healthRing"), props: HealthRingProps }),
  z.object({ ...b, type: z.literal("homeTile"), props: HomeTileProps }),
  // v8.0 rotation
  z.object({ ...b, type: z.literal("deck"), props: DeckProps }),
]);

export const Row = z.object({
  id: z.string().min(1),
  h: z.number().int().min(1).max(24).default(4), // height units; the page is 24 tall
  blocks: z.array(Widget).min(1).max(4),
});

// A signage zone: a rectangle of the screen (percentages of width/height) with
// its own stack of rows. Zones may tile or overlap. Optional on Layout — a board
// with no `zones` renders as one full-screen document exactly as before.
export const Zone = z.object({
  id: z.string().min(1),
  rect: z.object({
    x: z.number().min(0).max(100).default(0),
    y: z.number().min(0).max(100).default(0),
    w: z.number().min(1).max(100).default(100),
    h: z.number().min(1).max(100).default(100),
  }),
  rows: z.array(Row).max(40).default([]),
});

export const Layout = z.object({
  schemaVersion: z.literal(3),
  name: z.string().min(1),
  // fontScale is optional with a default → existing v3 docs parse unchanged (no migration).
  theme: z.object({
    // "auto" follows the screen's sun: light by day, dark after sunset (server-resolved).
    mode: z.enum(["light", "dark", "auto"]).default("light"),
    fontScale: z.enum(["s", "m", "l"]).default("m"),
    // v6.1 "Look" — a calm, monochrome typographic character (weight + tracking + accent).
    // Optional → existing v3 docs render as before; the screen defaults it.
    look: z.enum(["editorial", "terminal", "grotesk", "stencil"]).optional(),
  }).default({ mode: "light", fontScale: "m" }),
  gap: z.number().int().min(0).max(8).default(2),
  // where the (often shorter-than-screen) content sits vertically — v0.6, optional
  align: z.enum(["top", "center", "bottom"]).default("top"),
  rows: z.array(Row).max(40),
  // multi-zone signage: optional, no migration. Absent = single full-screen doc.
  zones: z.array(Zone).max(12).optional(),
  // v8.0 spotlight: cycle a calm emphasis across the board's blocks (others dim), one at a
  // time, every N seconds. Optional → absent = no spotlight, renders exactly as before.
  spotlight: z.object({ seconds: z.number().int().min(3).max(600).default(20) }).optional(),
  // v9.x multi-page boards: extra pages beyond `rows` (page 0 = `rows`). The screen
  // rotates through [rows, ...pages] every `pageRotateSeconds` (deterministic from the
  // wall clock so screens stay in lockstep); absent → single page, renders as before.
  // Optional + additive → no migration; old docs (and screens that ignore it) are unaffected.
  pages: z.array(z.array(Row).max(40)).max(8).optional(),
  pageRotateSeconds: z.number().int().min(3).max(3600).optional(),
  // v10 rich page rotation (supersedes the single pageRotateSeconds without breaking it):
  // per-page config, index-aligned to the full page list `[rows, ...pages]` (entry 0
  // configures the base `rows` page). Each page may set its own dwell `seconds` and a
  // `schedule` limiting WHEN it appears — a daily time window (wraps past midnight),
  // weekdays, and an inclusive date range. Pages whose schedule excludes "now" are skipped
  // in the rotation; the screen derives the active page deterministically from the wall
  // clock so synced screens stay in lockstep. `pageTransitionMs` is the fade/gap between
  // pages (0 = instant). All optional + additive → no migration; old docs unaffected.
  pageSettings: z
    .array(
      z.object({
        name: z.string().max(60).optional(),
        seconds: z.number().int().min(1).max(3600).optional(),
        schedule: z
          .object({
            startMin: z.number().int().min(0).max(1439).optional(),
            endMin: z.number().int().min(0).max(1439).optional(),
            daysMask: z.number().int().min(0).max(127).optional(),
            fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          })
          .optional(),
      }),
    )
    .max(9)
    .optional(),
  pageTransitionMs: z.number().int().min(0).max(2000).optional(),
});

export type WidgetT = z.infer<typeof Widget>;
export type WidgetType = WidgetT["type"];
export type RowT = z.infer<typeof Row>;
export type ZoneT = z.infer<typeof Zone>;
export type LayoutT = z.infer<typeof Layout>;
export type PageSettingT = NonNullable<LayoutT["pageSettings"]>[number];
export type PageScheduleT = NonNullable<PageSettingT["schedule"]>;

export const PAGE_UNITS = 24;
