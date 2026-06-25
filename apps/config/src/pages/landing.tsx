import type { LayoutT } from "@glanceos/schema";
import { useMemo } from "preact/hooks";
import { BoardPreview } from "../components/BoardPreview";
import { BLOCKS } from "../editor/blocks";
import { BlockIcon } from "../editor/blockIcons";
import { Icon } from "../editor/icons";

// The home page: liquid-glass surfaces over a monochrome fog, a monumental
// hero with a faint suspension-bridge motif, and Notion-calm typography. The
// demo is the ACTUAL <30 KB screen runtime — no signup, the homepage IS the product.

const FEATURES = [
  { icon: Icon.target, title: "Claim in seconds", body: "A screen shows a short code. Type it once — the display is yours, forever paired." },
  { icon: Icon.pencil, title: "Edit like a document", body: "The Studio works like Notion: type anywhere, drag blocks by their handle, drop beside for columns." },
  { icon: Icon.grid, title: `${BLOCKS.length} calm blocks`, body: "Clocks, weather, lists, stats, gauges, countdowns, moon phase, menus — all in quiet black and white." },
  { icon: Icon.link, title: "Connect 177 apps", body: "Point any block at a live source — GitHub, Reddit, Stripe, Strava, calendars, RSS and 171 more. Many need no login; tokens stay encrypted server-side." },
  { icon: Icon.convert, title: "Live in under a second", body: "Every edit streams to connected screens over SSE. No refresh, no app, no waiting." },
  { icon: Icon.layers, title: "Boards outlive screens", body: "Disconnect a screen and its board survives. Run one board on five screens — they stay in step." },
  { icon: Icon.home, title: "Yours, entirely", body: "One container, one SQLite file, MIT licensed. No account with anyone, no subscription, no telemetry." },
];

const STEPS = [
  { n: "1", title: "Open a screen", body: "Point any browser — TV, monitor, tablet — at your server. It registers itself and shows a claim code." },
  { n: "2", title: "Claim and compose", body: "Enter the code, then arrange blocks in the Studio. The preview is the exact renderer your screen runs." },
  { n: "3", title: "Glance", body: "Look, understand, move on. Boards update live; screens survive Wi-Fi blips without going blank." },
];

// Honest positioning vs the usual rent-a-screen-in-our-cloud dashboard services
// — framed generically (no specific competitor claims to get wrong/be unfair about).
const COMPARE = [
  { dim: "Price", us: "Free, forever — no subscription", them: "Usually a monthly or annual plan" },
  { dim: "Where it runs", us: "Your own server — one small container", them: "The vendor's cloud" },
  { dim: "Your data", us: "Stays on your machine; zero telemetry", them: "Held in the vendor's cloud" },
  { dim: "Source", us: "Open source (MIT) — audit it, fork it", them: "Typically closed source" },
  { dim: "Screens", us: "Any browser — TV, tablet or e-ink panel", them: "Often one specific device or app" },
  { dim: "Make it yours", us: `${BLOCKS.length} blocks + a Notion-style editor`, them: "Fixed templates, limited layout" },
  { dim: "Live data", us: "177 sources, ~108 with no login at all", them: "Varies; often a paid add-on" },
];

function BridgeMotif() {
  // a faint suspension-bridge line drawing behind the hero
  return (
    <svg class="bridge" viewBox="0 0 1200 320" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMax slice">
      <path d="M0 80 Q 300 300 600 90 T 1200 80" stroke="currentColor" stroke-width="2" />
      <path d="M0 96 Q 300 312 600 106 T 1200 96" stroke="currentColor" stroke-width="1" />
      {Array.from({ length: 30 }, (_, i) => {
        const x = 20 + i * 40;
        return <line key={i} x1={x} y1={88} x2={x} y2={320} stroke="currentColor" stroke-width="1" opacity="0.5" />;
      })}
      <line x1="300" y1="0" x2="300" y2="320" stroke="currentColor" stroke-width="3" />
      <line x1="900" y1="0" x2="900" y2="320" stroke="currentColor" stroke-width="3" />
    </svg>
  );
}

// A canned board that shows off the v7.0 "knows your day" story — Focus now, Leave
// by, the day's timeline — fed to the real runtime below. Times are relative to the
// viewer's clock (built fresh on mount) so the demo is alive, not a screenshot.
const DEMO_BOARD = {
  schemaVersion: 3,
  name: "A day at a glance",
  theme: { mode: "light", fontScale: "m" },
  gap: 3,
  align: "top",
  rows: [
    { id: "r1", h: 20, blocks: [{ id: "day1", type: "myDay", width: 1, props: { name: "Alex", subtitle: "", showDate: true } }] },
    { id: "r2", h: 44, blocks: [
      { id: "focus1", type: "focusNow", width: 1, props: { label: "Right now", items: "" } },
      { id: "leave1", type: "leaveBy", width: 1, props: { label: "Leave by", items: "", travelMinutes: 15 } },
    ] },
    { id: "r3", h: 36, blocks: [
      { id: "agenda1", type: "dayTimeline", width: 1, props: { label: "Today", items: "", max: 5 } },
      { id: "steps1", type: "healthRing", width: 1, props: { label: "Steps", value: 7200, goal: 10000, unit: "" } },
    ] },
  ],
} as unknown as LayoutT;

const buildDemoData = (): Record<string, unknown> => {
  const now = Date.now();
  const ev = (min: number, title: string, location?: string) => ({ start: new Date(now + min * 60_000).toISOString(), title, location });
  const agenda = [ev(-12, "Design review", "Studio"), ev(22, "1:1 with Sam", "Zoom"), ev(95, "Gym"), ev(200, "Dinner", "Home")];
  return { day1: { temperatureC: 21, summary: "clear" }, focus1: { events: agenda }, leave1: { events: agenda }, agenda1: { events: agenda } };
};

function DemoBoard() {
  const data = useMemo(buildDemoData, []);
  return (
    <div class="mock-frame glass-strong">
      <BoardPreview doc={DEMO_BOARD} data={data} w={1920} h={1080} deviceName="Live demo" />
    </div>
  );
}

// Link a screen straight into the runtime in TV mode — so on a TV you just open
// the home page and click, instead of typing /screen/?tv=1 with the remote. We
// best-effort tag the platform from the user-agent so the fleet shows the right
// chip (Fire TV models report "AFT…"; Android TV reports Android + TV/GoogleTV).
// The server sanitizes the value, so a wrong guess is harmless.
function screenModeHref(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  let platform = "";
  if (/AFT/i.test(ua)) platform = "firetv";
  else if (/Android/i.test(ua) && /(TV|GoogleTV|BRAVIA)/i.test(ua)) platform = "androidtv";
  return platform ? `/screen/?tv=1&platform=${platform}` : "/screen/?tv=1";
}

export function Landing({ registrationOpen }: { registrationOpen: boolean }) {
  const cta = registrationOpen ? "#/register" : "#/login";
  const ctaLabel = registrationOpen ? "Get started" : "Log in";
  return (
    <div class="landing">
      <div class="fog" aria-hidden="true" />
      <header class="landing-nav glass">
        <span class="brand">glanceos</span>
        <nav class="landing-links">
          <a href="#features">Features</a>
          <a href="#blocks">Blocks</a>
          <a href="#how">How it works</a>
        </nav>
        <span class="spacer" />
        <a class="btn ghost-link" href={screenModeHref()}>
          Screen mode
        </a>
        <a class="btn ghost-link" href="#/login">
          Log in
        </a>
        <a class="btn solid" href={cta}>
          {ctaLabel}
        </a>
      </header>

      <section class="hero">
        <BridgeMotif />
        <p class="hero-pill glass">Open source · Self-hosted · MIT</p>
        <h1 class="hero-title">
          Any screen.
          <br />
          One calm glance.
        </h1>
        <p class="hero-lede">
          GlanceOS turns spare monitors, TVs and tablets into quiet dashboards you compose like a
          document — and update live from anywhere in the house.
        </p>
        <div class="hero-ctas">
          <a class="btn solid lg" href={cta}>
            {ctaLabel} →
          </a>
          <a class="btn glass-btn lg" href={screenModeHref()}>
            Open screen mode →
          </a>
          <a class="btn glass-btn lg" href="https://github.com/devank-yadav/glanceos" target="_blank" rel="noopener">
            View on GitHub ↗
          </a>
        </div>
        <a class="hero-howlink" href="#how">or see how it works ↓</a>
        <p class="hero-caption">On the TV itself? Open <strong>screen mode</strong> — it shows a pairing code you claim from any signed-in device. No typing URLs.</p>
        <DemoBoard />
        <p class="hero-caption">This is the live runtime — the exact pixels your screens render. No signup to look.</p>
        <ul class="trust-strip" aria-label="What you get">
          <li>No subscription</li>
          <li>No telemetry</li>
          <li>Own your data</li>
          <li>One container · SQLite</li>
          <li>MIT licensed</li>
        </ul>
      </section>

      <section id="features" class="section">
        <h2 class="section-title">Built for the glance</h2>
        <div class="feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} class="feature-card glass">
              <span class="feature-glyph"><f.icon /></span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="blocks" class="section">
        <h2 class="section-title">{BLOCKS.length} blocks, one quiet language</h2>
        <p class="section-lede">
          Everything renders in black and white, type-first — so every board looks intentional, whatever you put on it.
        </p>
        <div class="block-wall">
          {BLOCKS.map((b) => (
            <span key={b.type} class="block-chip" title={b.description}>
              <span class="block-chip-glyph"><BlockIcon type={b.type} /></span>
              {b.label}
            </span>
          ))}
        </div>
      </section>

      <section id="how" class="section">
        <h2 class="section-title">Three steps to a calm wall</h2>
        <div class="steps-grid">
          {STEPS.map((s) => (
            <div key={s.n} class="step-card">
              <span class="step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="compare" class="section">
        <h2 class="section-title">How it's different</h2>
        <p class="section-lede">Most dashboard services rent you a screen in their cloud. GlanceOS is the opposite — free, open, and entirely yours.</p>
        <div class="compare-wrap">
          <table class="compare-table">
            <thead>
              <tr>
                <th scope="col"><span class="sr-only">Dimension</span></th>
                <th scope="col" class="cmp-head-us">GlanceOS</th>
                <th scope="col" class="cmp-head-them">Typical hosted dashboard</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((r) => (
                <tr key={r.dim}>
                  <th scope="row">{r.dim}</th>
                  <td class="cmp-us">{r.us}</td>
                  <td class="cmp-them">{r.them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section">
        <div class="cta-final glass-strong">
          <h2>Put your first screen to work.</h2>
          <p class="muted">Self-hosted in one container. Your data never leaves your server.</p>
          <a class="btn solid lg" href={cta}>
            {ctaLabel} →
          </a>
          {!registrationOpen && <p class="muted cta-closed-note">Sign-ups are closed on this server — ask whoever runs it for an account.</p>}
        </div>
      </section>

      <footer class="landing-foot">
        <span class="brand">glanceos</span>
        <span class="muted">MIT licensed · self-hosted · made for quiet rooms · <a href="https://github.com/devank-yadav/glanceos" target="_blank" rel="noopener">GitHub</a></span>
      </footer>
    </div>
  );
}
