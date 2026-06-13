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
export const ImageProps = z.object({ url: httpUrl, fit: z.enum(["cover", "contain"]).default("cover") });
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
export const GreetingProps = z.object({ name: line(60).default("") });
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

const b = { id: z.string().min(1), width: z.number().min(0.2).max(5).default(1), style: BlockStyle.prefault({}) };

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
]);

export const Row = z.object({
  id: z.string().min(1),
  h: z.number().int().min(1).max(24).default(4), // height units; the page is 24 tall
  blocks: z.array(Widget).min(1).max(4),
});

export const Layout = z.object({
  schemaVersion: z.literal(3),
  name: z.string().min(1),
  theme: z.object({ mode: z.enum(["light", "dark"]).default("light") }).default({ mode: "light" }),
  gap: z.number().int().min(0).max(8).default(2),
  // where the (often shorter-than-screen) content sits vertically — v0.6, optional
  align: z.enum(["top", "center", "bottom"]).default("top"),
  rows: z.array(Row).max(40),
});

export type WidgetT = z.infer<typeof Widget>;
export type WidgetType = WidgetT["type"];
export type RowT = z.infer<typeof Row>;
export type LayoutT = z.infer<typeof Layout>;

export const PAGE_UNITS = 24;
