import type { LayoutT } from "@glanceos/schema";
import { useMemo } from "preact/hooks";
import { BoardPreview } from "../components/BoardPreview";
import { BLOCKS } from "../editor/blocks";
import { BlockIcon } from "../editor/blockIcons";
import { Icon } from "../editor/icons";

// The home page: liquid-glass surfaces over a monochrome fog, a monumental
// hero with a faint suspension-bridge motif, and Notion-calm typography. The
// demo is the ACTUAL <32 KB screen runtime — no signup, the homepage IS the product.

const FEATURES = [
  { icon: Icon.convert, title: "A wall that knows what's going on", body: "Point a board at your live tools — deploys, pull requests, incidents, on-call, sprint, KPIs. It updates the second things change, not on a slideshow timer." },
  { icon: Icon.target, title: "Live in two minutes", body: "Open any browser, TV or Raspberry Pi, enter the code on screen, pick a team template. Done — no app to install, no per-device setup." },
  { icon: Icon.settings, title: "Built for teams", body: "Invite your team by email, with roles. Everyone shares the same boards and screens; admins manage people, viewers just watch." },
  { icon: Icon.link, title: "Connect 190 apps", body: "GitHub, Sentry, Stripe, Linear, calendars, RSS and 170+ more. Many need no login; tokens are encrypted on our server, never on the screen." },
  { icon: Icon.grid, title: `${BLOCKS.length} calm blocks`, body: "Stats, charts, lists, gauges, countdowns, clocks, menus — quiet black-and-white that reads from across the room." },
  { icon: Icon.layers, title: "Boards outlive screens", body: "Run one board on every screen in the office and they stay in step. Swap a screen and its board carries over." },
];

const STEPS = [
  { n: "1", title: "Open a screen", body: "Point any browser — TV, monitor, tablet, Pi — at GlanceOS. It shows a short pairing code." },
  { n: "2", title: "Pick a team board", body: "Enter the code, then start from a team template or compose your own. The preview is the exact renderer your screen runs." },
  { n: "3", title: "The room just knows", body: "Boards update live as your tools change. Invite the team and put a board on every wall." },
];

// Positioning vs legacy digital-signage (ScreenCloud/Yodeck-style) — framed generically.
const COMPARE = [
  { dim: "What it shows", us: "Live team data — deploys, on-call, sprint, KPIs", them: "Static slideshows of images & PDFs" },
  { dim: "Setup", us: "Any screen, paired in minutes — no per-device app", them: "Install a player app on each device" },
  { dim: "Make it yours", us: `${BLOCKS.length} blocks + a Notion-style editor`, them: "Fixed templates, limited layout" },
  { dim: "Updates", us: "The instant your data changes (live SSE)", them: "On a fixed slide rotation" },
  { dim: "Screens", us: "Browser, TV, tablet, Raspberry Pi or e-ink", them: "Often one specific device" },
  { dim: "Price", us: "1 screen free, then simple per-screen", them: "Per-screen subscription from day one" },
];

// Pricing slot — marketing only (no checkout yet). Numbers per the per-screen model.
const PRICING = [
  { name: "Free", price: "$0", unit: "1 screen", body: "For trying it out and personal walls.", cta: "Start free", features: ["1 connected screen", `All ${BLOCKS.length} blocks`, "Live integrations"] },
  { name: "Team", price: "$3", unit: "per extra screen / mo", body: "For offices — capped at $20/mo for up to 10 screens.", cta: "Start free", features: ["Unlimited boards", "Invite your team + roles", "Fleet management", "Live team-data blocks"], featured: true },
  { name: "Enterprise", price: "Let's talk", unit: "", body: "SSO, audit, proof-of-play, support.", cta: "Contact us", features: ["Everything in Team", "SSO / SCIM", "Audit log + proof-of-play", "Priority support"] },
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
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
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
        <p class="hero-pill glass">For teams · Live data · Any screen</p>
        <h1 class="hero-title">
          The office wall that
          <br />
          knows what's going on.
        </h1>
        <p class="hero-lede">
          GlanceOS turns any screen into a live team wall — deploys, on-call, sprint, KPIs, room status —
          composed like a document and updated the second things change. Set up in minutes.
        </p>
        <div class="hero-ctas">
          <a class="btn solid lg" href={cta}>
            {ctaLabel} →
          </a>
          <a class="btn glass-btn lg" href={screenModeHref()}>
            Open screen mode →
          </a>
        </div>
        <a class="hero-howlink" href="#how">or see how it works ↓</a>
        <p class="hero-caption">On the TV itself? Open <strong>screen mode</strong> — it shows a pairing code you claim from any signed-in device. No typing URLs.</p>
        <DemoBoard />
        <p class="hero-caption">This is the live runtime — the exact pixels your screens render. No signup to look.</p>
        <ul class="trust-strip" aria-label="What you get">
          <li>Set up in minutes</li>
          <li>Works on any screen</li>
          <li>Live team data</li>
          <li>1 screen free</li>
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
        <p class="section-lede">Legacy signage loops slideshows of images and PDFs. GlanceOS shows what's actually happening — live.</p>
        <div class="compare-wrap">
          <table class="compare-table">
            <thead>
              <tr>
                <th scope="col"><span class="sr-only">Dimension</span></th>
                <th scope="col" class="cmp-head-us">GlanceOS</th>
                <th scope="col" class="cmp-head-them">Legacy signage</th>
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

      <section id="pricing" class="section">
        <h2 class="section-title">Simple, per-screen pricing</h2>
        <p class="section-lede">Start free with one screen. Add screens as your walls grow — you only pay for what's on the wall.</p>
        <div class="pricing-grid">
          {PRICING.map((p) => (
            <div key={p.name} class={`price-card glass${p.featured ? " price-featured" : ""}`}>
              {p.featured && <span class="price-badge">Most popular</span>}
              <h3 class="price-name">{p.name}</h3>
              <p class="price-amount"><span class="price-num">{p.price}</span>{p.unit && <span class="price-unit"> {p.unit}</span>}</p>
              <p class="price-body muted">{p.body}</p>
              <ul class="price-features">
                {p.features.map((f) => <li key={f}><Icon.check /> {f}</li>)}
              </ul>
              <a class={`btn lg ${p.featured ? "solid" : "glass-btn"}`} href={p.name === "Enterprise" ? "mailto:hello@glanceos.app" : cta}>{p.cta}</a>
            </div>
          ))}
        </div>
      </section>

      <section class="section">
        <div class="cta-final glass-strong">
          <h2>Put your team on the wall.</h2>
          <p class="muted">Set up your first screen in minutes. One screen is free, forever.</p>
          <a class="btn solid lg" href={cta}>
            {ctaLabel} →
          </a>
          {!registrationOpen && <p class="muted cta-closed-note">Sign-ups are closed on this server — ask your admin for an account.</p>}
        </div>
      </section>

      <footer class="landing-foot">
        <span class="brand">glanceos</span>
        <span class="muted">The office wall that knows what's going on · made for teams</span>
      </footer>
    </div>
  );
}
