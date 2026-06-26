import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Icon } from "../editor/icons";

// Founder metrics (admin-only): the activation funnel + active users + cohort retention.
// The numbers a YC application asks for, computed first-party from the events table.

interface Metrics {
  funnel: { signup: number; first_board_created: number; screen_claimed: number; activated: number };
  active: { dau: number; wau: number };
  retention: { cohort: number; d1: { returned: number; rate: number }; d7: { returned: number; rate: number } };
}

const STEPS: { key: keyof Metrics["funnel"]; label: string }[] = [
  { key: "signup", label: "Signed up" },
  { key: "first_board_created", label: "Created a board" },
  { key: "screen_claimed", label: "Connected a screen" },
  { key: "activated", label: "Activated (board on a screen)" },
];

export function MetricsPage() {
  const [m, setM] = useState<Metrics | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    api.get<Metrics>("/api/admin/metrics").then(setM).catch(() => setForbidden(true));
  }, []);

  if (forbidden) return <div class="page"><PageHeader title="Metrics" /><EmptyState icon={<Icon.settings />} title="Admins only" body="The activation funnel is visible to the instance owner." /></div>;
  if (!m) return <div class="page"><PageHeader title="Metrics" /><p class="muted">Loading…</p></div>;

  const top = Math.max(1, m.funnel.signup);
  const pct = (n: number) => Math.round((n / top) * 100);

  return (
    <div class="page metrics-page">
      <PageHeader title="Founder metrics" />

      <div class="card">
        <h2 class="card-title">Activation funnel</h2>
        <div class="funnel">
          {STEPS.map((s) => {
            const n = m.funnel[s.key];
            return (
              <div key={s.key} class="funnel-row">
                <span class="funnel-label">{s.label}</span>
                <div class="funnel-bar"><div class="funnel-fill" style={{ width: `${pct(n)}%` }} /></div>
                <span class="funnel-count">{n}<span class="muted"> · {pct(n)}%</span></span>
              </div>
            );
          })}
        </div>
        <p class="hint muted">% is of all sign-ups. Activation = a board showing on a real screen.</p>
      </div>

      <div class="metrics-grid">
        <div class="card stat-card"><span class="stat-num">{m.active.dau}</span><span class="stat-cap muted">Active today (DAU)</span></div>
        <div class="card stat-card"><span class="stat-num">{m.active.wau}</span><span class="stat-cap muted">Active this week (WAU)</span></div>
        <div class="card stat-card">
          <span class="stat-num">{Math.round(m.retention.d1.rate * 100)}%</span>
          <span class="stat-cap muted">D1 retention<br/>{m.retention.d1.returned}/{m.retention.cohort} of the cohort</span>
        </div>
        <div class="card stat-card">
          <span class="stat-num">{Math.round(m.retention.d7.rate * 100)}%</span>
          <span class="stat-cap muted">D7 retention<br/>{m.retention.d7.returned}/{m.retention.cohort} of the cohort</span>
        </div>
      </div>
    </div>
  );
}
