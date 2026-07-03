// #122 — the "get to a live wall" checklist, computed from REAL account counts (the
// #167 data-summary endpoint) — never a stored wizard state that can drift. Pure.
export interface OnboardSummary { boards: number; screens: number; automations: number; connections: { status: string }[] }
export interface OnboardStep { key: string; label: string; hint: string; href: string; done: boolean }

export function onboardSteps(s: OnboardSummary): OnboardStep[] {
  return [
    { key: "board", label: "Create your first board", hint: "start from a template or blank", href: "#/hub", done: s.boards > 0 },
    { key: "screen", label: "Put it on a screen", hint: "any browser, TV, or e-ink panel", href: "#/screens", done: s.screens > 0 },
    { key: "data", label: "Connect live data", hint: "calendar, weather, or a CSV", href: "#/integrations", done: s.connections.length > 0 },
    { key: "rule", label: "Add a rule", hint: "let the wall react on its own", href: "#/automations", done: s.automations > 0 },
  ];
}
