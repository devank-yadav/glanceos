# apps/config

The product's face: accounts, the screens dashboard, setups, the template hub, and the **Studio** — drag-and-drop editing on a live preview that *is* the real screen runtime ([DECISIONS 020](../../docs/DECISIONS.md)). Preact + plain hooks; no router library, no drag-drop library, no react-compat.

**Run it:** `pnpm dev` (port 5174, proxies `/api` to :8080). The production build is served by the server at `/` — one process, one URL, one container. `pnpm test` runs the editor's geometry + history unit tests.

**Map:**

| Path | What it is |
|---|---|
| `src/router.ts` | hash router (~30 lines): `#/`, `#/setups`, `#/hub`, `#/edit/:id`, `#/login`, `#/register` |
| `src/auth.tsx` | login / register pages (`registrationOpen` hides register) |
| `src/pages/screens.tsx` | dashboard: device cards, claim flow, empty-state onboarding, post-claim setup picker, tasks/queue data panels |
| `src/pages/setups.tsx` | boards decoupled from screens: duplicate, export/import JSON, publish to hub, delete |
| `src/pages/hub.tsx` | browse/search published boards, import a copy |
| `src/thumb.tsx` | gray-box layout thumbnails — geometry only |
| `src/editor/studio.tsx` | the Studio shell: load, autosave, preview data, keyboard, undo/redo |
| `src/editor/state.ts` | history reducer — a drag or typing burst = exactly one undo step (unit-tested) |
| `src/editor/geometry.ts` | pure document-flow math (lines/columns, hit-testing, drop semantics) mirroring the screen runtime (unit-tested) |
| `src/editor/preview.tsx` | the scaled iframe + postMessage bridge to `apps/screen?preview=1` |
| `src/editor/overlay.tsx` | ALL pointer input: ⠿ handle drags with the drop-indicator line, column gutters, select, double-click-to-insert |
| `src/editor/palette.tsx` | drag-from-sidebar with the same indicator semantics + click-to-append |
| `src/editor/slash-menu.tsx` | the Notion-style `/` insert menu |
| `src/editor/properties.tsx` | per-block prop forms + board settings |
| `src/editor/blocks.ts` | the one registry of all 46 block types (category, glyph, default height, default props) |

**Why the preview can't drift:** the config app never renders widgets. The Studio embeds the actual screen runtime in an iframe and posts draft state into it — the pixels you arrange are produced by the same code every real screen runs.

**Not here yet, on purpose:** multi-select / copy-paste between setups, collaborative editing (icebox).
