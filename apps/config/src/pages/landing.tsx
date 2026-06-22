import { useEffect, useState } from "preact/hooks";
import { BLOCKS } from "../editor/blocks";
import { BlockIcon } from "../editor/blockIcons";
import { Icon } from "../editor/icons";

// The home page: liquid-glass surfaces over a monochrome fog, a monumental
// hero with a faint suspension-bridge motif, and Notion-calm typography.
// Pure presentation — the only JS is the ticking clock in the mock board.

const FEATURES = [
  { icon: Icon.target, title: "Claim in seconds", body: "A screen shows a short code. Type it once — the display is yours, forever paired." },
  { icon: Icon.pencil, title: "Edit like a document", body: "The Studio works like Notion: type anywhere, drag blocks by their handle, drop beside for columns." },
  { icon: Icon.grid, title: "199 calm blocks", body: "Clocks, weather, lists, stats, gauges, countdowns, moon phase, menus — all in quiet black and white." },
  { icon: Icon.convert, title: "Live in under a second", body: "Every edit streams to connected screens over SSE. No refresh, no app, no waiting." },
  { icon: Icon.layers, title: "Boards outlive screens", body: "Disconnect a screen and its board survives. Run one board on five screens — they stay in step." },
  { icon: Icon.home, title: "Yours, entirely", body: "One container, one SQLite file, MIT licensed. No account with anyone, no subscription, no telemetry." },
];

const STEPS = [
  { n: "1", title: "Open a screen", body: "Point any browser — TV, monitor, tablet — at your server. It registers itself and shows a claim code." },
  { n: "2", title: "Claim and compose", body: "Enter the code, then arrange blocks in the Studio. The preview is the exact renderer your screen runs." },
  { n: "3", title: "Glance", body: "Look, understand, move on. Boards update live; screens survive Wi-Fi blips without going blank." },
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

function MockBoard() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div class="mock-frame glass-strong" aria-hidden="true">
      <div class="mock-board">
        <div class="mock-row" style={{ flex: "0 0 30%" }}>
          <div class="mock-cell">
            <div class="mock-time">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            <div class="mock-sub">{now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</div>
          </div>
          <div class="mock-cell mock-right">
            <div class="mock-temp">24°</div>
            <div class="mock-sub">clear evening</div>
          </div>
        </div>
        <div class="mock-row" style={{ flex: "0 0 18%" }}>
          <div class="mock-cell">
            <div class="mock-heading">Good evening.</div>
          </div>
        </div>
        <div class="mock-row" style={{ flex: "1" }}>
          <div class="mock-cell">
            <div class="mock-label">Tasks</div>
            <div class="mock-li">• Water the plants</div>
            <div class="mock-li">• Call grandma</div>
            <div class="mock-li">• Ship something calm</div>
          </div>
          <div class="mock-cell">
            <div class="mock-label">Tonight</div>
            <div class="mock-moon">🌖 Waning gibbous</div>
            <div class="mock-sub">sunset 19:42</div>
          </div>
        </div>
      </div>
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
        </div>
        <a class="hero-howlink" href="#how">or see how it works ↓</a>
        <p class="hero-caption">On the TV itself? Open <strong>screen mode</strong> — it shows a pairing code you claim from any signed-in device. No typing URLs.</p>
        <MockBoard />
        <p class="hero-caption">The Studio edits the exact pixels your screens render — zero drift, ever.</p>
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
        <span class="muted">MIT licensed · self-hosted · made for quiet rooms</span>
      </footer>
    </div>
  );
}
