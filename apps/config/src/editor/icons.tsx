import type { JSX } from "preact";

// A tiny dependency-free, Feather-style inline-SVG icon set for the Studio
// chrome (topbar, block menu, drag handle, alignment, sidebar). Stroke uses
// currentColor so icons inherit text colour; size is set in CSS per context.

type P = { class?: string };
const svg = (children: JSX.Element | JSX.Element[]): ((p: P) => JSX.Element) =>
  ({ class: c }: P) => (
    <svg class={c} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {children}
    </svg>
  );

export const Icon = {
  undo: svg([<path d="M9 7 4 12l5 5" />, <path d="M4 12h11a5 5 0 0 1 0 10h-3" />]),
  redo: svg([<path d="m15 7 5 5-5 5" />, <path d="M20 12H9a5 5 0 0 0 0 10h3" />]),
  help: svg([<circle cx="12" cy="12" r="9" />, <path d="M9.2 9a3 3 0 0 1 5.6 1.3c0 2-3 2.7-3 2.7" />, <path d="M12 17h.01" />]),
  play: svg(<path d="M7 5v14l11-7z" fill="currentColor" stroke="none" />),
  pencil: svg([<path d="M12 20h9" />, <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />]),
  convert: svg([<path d="m16 3 4 4-4 4" />, <path d="M20 7H9a5 5 0 0 0-5 5" />, <path d="m8 21-4-4 4-4" />, <path d="M4 17h11a5 5 0 0 0 5-5" />]),
  link: svg([<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" />, <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />]),
  settings: svg([<circle cx="12" cy="12" r="3" />, <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 4.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 2.6V2a2 2 0 0 1 4 0v.1A1.6 1.6 0 0 0 17 4.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H23a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />]),
  trash: svg([<path d="M3 6h18" />, <path d="M8 6V4h8v2" />, <path d="m6 6 1 14h10l1-14" />, <path d="M10 11v5M14 11v5" />]),
  grip: svg([<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none" />, <circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none" />, <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />, <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />, <circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none" />, <circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none" />]),
  alignLeft: svg([<path d="M4 7h11" />, <path d="M4 12h16" />, <path d="M4 17h9" />]),
  alignCenter: svg([<path d="M7 7h10" />, <path d="M4 12h16" />, <path d="M6 17h12" />]),
  alignRight: svg([<path d="M9 7h11" />, <path d="M4 12h16" />, <path d="M11 17h9" />]),
  alignTop: svg([<path d="M4 5h16" />, <path d="M12 9v11" />, <path d="m8 13 4-4 4 4" />]),
  alignMiddle: svg([<path d="M4 12h16" />, <path d="M12 4v4M12 16v4" />, <path d="m9 7 3-3 3 3M9 17l3 3 3-3" />]),
  alignBottom: svg([<path d="M4 19h16" />, <path d="M12 4v11" />, <path d="m8 11 4 4 4-4" />]),
  panelToggle: svg([<rect x="3" y="4" width="18" height="16" rx="2" />, <path d="M14 4v16" />]),
  pin: svg([<path d="M12 17v5" />, <path d="M9 3h6l-1 6 3 3H7l3-3-1-6z" />]),
  chevron: svg(<path d="m9 6 6 6-6 6" />),
  check: svg(<path d="M5 13l4 4L19 7" />),
  warning: svg([<path d="M12 3 2 20h20L12 3z" />, <path d="M12 10v4" />, <path d="M12 17h.01" />]),
  search: svg([<circle cx="11" cy="11" r="7" />, <path d="m21 21-4.3-4.3" />]),
  plus: svg([<path d="M12 5v14" />, <path d="M5 12h14" />]),
};
