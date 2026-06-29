# GlanceOS — Master Feature Catalog

## Context
This is a **reference menu**, not a one-shot execution plan. It's the durable backlog we build from over time. You asked for a huge, numbered list of every feature we could add — grounded in a full read of the current codebase — so you can reply with the numbers you want built. **We build in priority batches of 20**: the **Top-20 Must-Have shortlist** below is batch 1; ask for "the next 20" whenever you want the following batch ranked.

**AI / LLM features are intentionally excluded** (per your direction). Anything that needs a model — generative authoring, natural-language rules/binding, AI summaries, anomaly detection, auto-translation, generative art, predictive sensing, MCP-for-agents — has been removed from this catalog. (If that changes later, we can add an AI section back.)

**Product north-star (the direction I'm organizing around):**
GlanceOS is *the calm, private, context-aware productivity wall* — design a board once, show it on any screen (e-ink, TV, web, native); it shows the right thing at the right time, stays quiet when it should, and respects your attention and your data. Primary audience: individual knowledge workers, with teams/offices as a natural extension. (Business / pricing / go-to-market is **out of scope** — product features only.)

**Already shipped (so it's *not* in this list, except where flagged as depth):** 214 block types; document-flow rows + columns + multi-page rotation with schedules + free-form zones + spotlight; per-board theme/look/font-scale + per-block style presets; e-ink/TV/web/cast/native runtimes with wake/quiet/burn-in; 188 server-side integrations; the automation engine (time/interval/sun/presence/webhook/device/tick triggers, 18 comparators incl. crossesAbove/sustained/stale/trend, 14 actions incl. respectQuiet/afterMinutes); calendar/weather/sun/presence/objects sensing; "since you looked" digest; custom-data store + webhook inlets + queues + tasks; Studio edit-in-place + slash menu + multi-select + undo/redo + data-binding + one-click "make it live"; boards/screens/groups; templates + publish; orgs/roles/members/invites + tenant isolation; sharing (email viewer/editor); command palette, i18n, PWA, mobile remote, lifecycle email.

**Legend:** ⭐ = strongly on-mission (calm / private / context-aware) · effort **[S]** small **[M]** medium **[L]** large/multi-phase · **NEW** net-new · **EXT** deepens an existing capability · **FIX** closes a real gap/limitation found in the code.

**How to use:** reply with the numbers (e.g. "build 1, 14, 84"), a Part ("do Part C"), or "build the Top 20". I'll plan + build each like the recent batch (committed, verified live, adversarially reviewed).

---

## ★ TOP 20 — Must-Have Shortlist (Build Batch 1)
The 20 to build first: the reliability/data-trust foundations, the editor table-stakes, and the calm-companion core that the product feels incomplete without. (Numbers reference the full catalog below; 16 of 20 are ⭐ on-mission.) Ask for "the next 20" when this batch is underway.

1. **#1 — Persist engine history** ⭐ — trend/sustained/stale/edge state survives restarts; rules stop re-baselining on every deploy. [M]
2. **#3 — Scenes** ⭐ — one tap/rule sets many objects+boards at once ("Focus", "Away"). [M]
3. **#12 — Automation run-history UI** — a searchable log of what fired, when, and why (replay). [M]
4. **#21 — Per-block last-known cache + "as of 5m ago" badge** ⭐ — never blank on a network blip. [M]
5. **#22 — Per-block error / fallback states** ⭐ — author what shows when a fetch fails. [S]
6. **#31 — Connection-health dashboard + auto-reconnect** ⭐ — one view of every connection's status, proactive re-auth. [M]
7. **#48 — Per-device block overrides** ⭐ — show the kitchen temp on the kitchen screen from one shared board. [L]
8. **#50 — Conditional visibility by value** ⭐ — hide/show a block based on its value, not just presence. [S]
9. **#84 — Reusable component / master blocks** ⭐ — define a card once, stamp instances, edit-once-update-everywhere. [L]
10. **#85 — Save-as-snippet library** — save any styled block/group and reuse it across boards. [M]
11. **#88 — Align & distribute tools** — left/center/right + distribute-evenly (editor table-stakes). [S]
12. **#89 — Group / ungroup blocks** — move/style/duplicate several blocks as a unit. [M]
13. **#95 — Version history v2** — named versions + visual diff + side-by-side restore. [M]
14. **#104 — Board folders / tags + search** ⭐ — organize beyond a flat list as boards grow. [M]
15. **#147 — Personal home board that follows you** ⭐ — your "my glance" on any screen you sit at. [M]
16. **#148 — Generated daily brief** ⭐ — calendar + tasks + weather composed into a calm morning summary (rule-based, no AI). [M]
17. **#149 — Focus mode** ⭐ — one tap hides noise; auto-on during calendar focus time. [M]
18. **#150 — Routines** ⭐ — morning/evening sequences that set boards, objects, quiet state. [M]
19. **#154 — Context-aware greeting & messaging** ⭐ — the wall speaks to your actual day ("3 meetings, rain at 4, leave by 5:10"). [S]
20. **#167 — Privacy dashboard** ⭐ — see exactly what's stored, which connection touched what, and delete it. [M]

---

## Part A — The Context Engine (sensing & automations)
*The heart of "context-aware." Make the wall reason about your day, not just display.*

1. **Persist engine history** — trend/sustained/stale/"changed"/edge state lives in memory and re-baselines on every restart; back it with the DB so rules survive deploys and `dryRun`/Run-now can replay real history. ⭐ [M] FIX
2. **Multi-step / branching automations** — `if/else`, per-action conditions, and action chains, so one rule can do different things based on state (today it's "all conditions → all actions"). [M] EXT
3. **Scenes** — name a set of object/board changes and fire them in one tap or one rule ("Focus", "Meeting", "Away") across screens. ⭐ [M] NEW
4. **Computed / derived values** — a safe expression layer (`sold / target`, `a + b`, `value > 0 ? "ok" : "low"`) usable in both conditions and block content. [L] NEW
5. **Multi-field correlations** — conditions like "A rising AND B falling", or "this value vs. that value", not just one field at a time. [M] EXT
6. **Arbitrary lookback windows** — trend/aggregate over any window (1h, 24h, 7d), not just the fixed ~12-sample buffer. ⭐ [M] EXT
7. **Day-type & calendar-aware conditions** — "is a workday / weekend / public holiday", "first time today", "during a meeting", "in focus time". ⭐ [M] EXT
8. **Calendar depth in sensing** — attendee count, "1:1 vs. group", organizer, "back-to-back meetings", "free for next 2h", next-3 events. ⭐ [M] EXT
9. **Presence depth** — geofence radius (not just home/away), multiple locations, room-level presence, occupancy via Wi-Fi/BLE bridge. ⭐ [M] EXT
10. **Manual trigger / button object** — a board object (or phone/remote tap) that fires an automation ("start pomodoro", "I'm here", "mark done"). ⭐ [S] NEW
11. **Data-arrival & value-cross triggers** — fire when a specific source updates, or a bound block's value crosses a line (today crossing only lives in conditions). [S] EXT
12. **Automation run-history UI** — searchable/filterable log of fires, with the matched condition + replay (runs are recorded but there's no inspection surface). [M] FIX
13. **Alert escalation & acknowledgement** — if no one acks in N minutes, escalate (louder / another channel / another person). [M] NEW
14. **Alert rate-limiting, grouping & snooze** — coalesce a storm of fires into one calm summary; per-rule snooze. ⭐ [S] EXT
15. **Recipe gallery v2 + shareable rules** — bigger curated library, plus export/import and team-shared automations. [M] EXT
16. **"Held vs. instant" surfaced everywhere** — expose `sustained`/`afterMinutes`/cooldown as first-class one-tap options on every rule (engine supports them; surface them better). [S] EXT
17. **Per-board variables passed to rules** — a board parameterized per screen (city/team/threshold) so one automation set serves many contexts. [M] NEW
18. **Simulation sandbox** — feed synthetic data + a clock to preview exactly what a rule would do over a day, before enabling. ⭐ [M] NEW

## Part B — Live Data & Integrations
*The data layer: more sources, smarter binding, two-way, resilient.*

19. **Write-back actions** — complete a Todoist task, advance a queue in the real app, set a Home Assistant entity (all 188 providers are read-only today). [L] EXT
20. **Streaming / real-time feeds** — websocket-backed sources for prices, sports, status — continuous updates instead of TTL polling. [L] NEW
21. **Per-block manual refresh + "last known value" cache + stale badge** — a refresh button, an offline fallback to the last good value, and a subtle "as of 5m ago" stamp. ⭐ [M] FIX
22. **Per-block error / fallback states** — author what shows on fetch failure: retry, fall back to typed props, or hide. ⭐ [S] FIX
23. **Transform chaining + more transforms** — chain shapers and add time-ago, "in N min", math, regex-extract, lookup-table, unit-convert. [M] EXT
24. **Visual schema explorer for deep JSON** — click through nested API responses to build the path/field mapping (today you type dotted paths). [M] FIX
25. **Edge filter / sort / limit** — a small query builder per source so you fetch the right 5 rows, not 100 truncated after the fact. [M] FIX
26. **Computed / blended data sources** — combine two sources into one block (a ratio, a merge, a diff). [L] NEW
27. **Data history / metric logging** — log any scalar over time server-side so you can chart a trend a provider doesn't expose ("my followers over 90 days"). ⭐ [M] NEW
28. **Local-network sources** — MQTT, Prometheus, SNMP, Home Assistant history, your own server — for self-hosters and home labs. [M] NEW
29. **File / CSV upload as a data source** — drop a spreadsheet, bind a block to it; refresh by re-upload or a watched URL. [M] NEW
30. **Webhooks *into* the board** — an inbound hook that triggers a page flip, a refresh, a cache clear, or a one-off banner (today inlets only write data). [S] FIX
31. **Connection-health dashboard + auto-reconnect** — one view of every connection's status / last-error / quota, with proactive re-auth nudges. ⭐ [M] EXT
32. **Token-expiry warnings + rotation** — warn before an OAuth/token connection lapses; rotate where the provider supports it. ⭐ [S] FIX
33. **Shared / org connections everywhere** — one connection, many members & boards (partly done for boards; extend to automations/inlets/uploads). [M] EXT
34. **New providers — productivity** — Microsoft To Do, Things, TickTick, Obsidian, Confluence, Coda, Basecamp, Twist. [M] NEW
35. **New providers — money/ops** — bank balances (read-only), QuickBooks/Xero, Datadog, Grafana, Prometheus alerts, cloud cost. [M] NEW
36. **New providers — life** — transit/commute, flights, package tracking, grocery, smart-scale. ⭐ [M] NEW
37. **Generic GraphQL/REST depth** — pagination, auth-header templates, body templates, response-caching controls for BYO sources. [M] EXT

## Part C — Delivery & Reach (off-screen)
*The wall is calm; sometimes you still need to be told. Reach you off the glass.*

38. **Mobile push notifications** — native + web push for the alerts you opted into (escalations, "leave by", a value crossed). ⭐ [L] NEW
39. **Two-way Slack / Discord / Telegram** — post an alert to a channel and acknowledge/snooze from there. [M] NEW
40. **SMS / voice for critical only** — a channel reserved for the genuinely urgent. [M] NEW
41. **Per-channel routing** — this alert → push, that one → email, the critical one → SMS; configured per rule. ⭐ [S] EXT
42. **Daily "morning brief" / "evening wind-down"** — a generated digest (your day, what changed, what needs attention) delivered to the wall and/or push/email. ⭐ [M] NEW
43. **Notification archive + search + export** — beyond the last-50 in-app inbox; a durable, searchable history. [S] FIX
44. **"Send this board" snapshot** — email/share a rendered PNG of a board on demand or on a schedule. [S] NEW
45. **Desktop / browser notifications** — for people who keep the web app open. [S] NEW
46. **Outbound recipes (Zapier/Make/IFTTT)** — a published app + event triggers so the wall drives other tools. [M] NEW
47. **Alert "digest mode"** — opt a noisy rule into "tell me once a day, batched" instead of per-fire. ⭐ [S] EXT

## Part D — Display Runtime & Devices
*The screen plane: more expressive layout, per-device smarts, richer rest states.*

48. **Per-device block overrides** — show the *kitchen* temp on the kitchen screen from one shared board (today layout is global per board). ⭐ [L] FIX
49. **Conditional visibility by device / orientation / size** — a block or page that only appears on TV vs. e-ink, or portrait vs. landscape. [M] FIX
50. **Conditional visibility by value** — hide a block when `value < 0`, or show it only when something's wrong (today only "whenData"). ⭐ [S] FIX
51. **Responsive breakpoints / adaptive layout** — one board that reflows for very different aspect ratios instead of squeezing. [L] FIX
52. **Free-form / overlay layer** — pin a badge/watermark/banner to a corner above the document flow (today everything is flow-only). [M] FIX
53. **Accent color / tint per block** — one subtle, e-ink-safe accent to make a single stat or alert pop within the monochrome system. [M] FIX
54. **Richer screensavers / ambient rest mode** — clock, slow photo slideshow, art-of-the-day, generative ambient — instead of just blank/dim. ⭐ [M] NEW
55. **Photo & art ambient mode** — a board that's a calm rotating gallery (your photos; museum APIs already exist; Unsplash). ⭐ [M] NEW
56. **Multi-screen video wall** — one board spanning a grid of screens (a lobby wall). [L] NEW
57. **Device input mapping** — remote A/B/X/Y → actions, touch tap-targets, QR deep-actions on the screen. [M] NEW
58. **Battery forecast → low-battery board swap** — when a panel is about to die, switch it to a minimal board and alert (forecast exists; act on it). ⭐ [S] EXT
59. **Offline-resilient on-device rendering** — cache the last-good render so a network blip never blanks the wall. ⭐ [M] FIX
60. **E-ink refinements** — partial-refresh hints, ghosting management, per-board dither presets surfaced in the UI. [M] EXT
61. **Ambient light / motion reactions** — dim or wake the board from a device sensor where available. ⭐ [M] NEW
62. **Per-zone theme override** — one zone dark, another light, in a multi-zone signage board. [S] FIX
63. **Calmer page transitions (opt-in)** — gentle slide / ken-burns for image pages, still within the no-bloat ethos. [S] EXT
64. **"Now showing" history per screen** — a richer proof-of-play timeline + export (basics exist for groups). [S] EXT
65. **Emergency broadcast** — instantly override every screen (or a group) with an alert board, then restore. [M] NEW

## Part E — Blocks & Widgets
*New content types and per-block smarts.*

66. **Dynamic QR / barcode block** — encodes a live value or a deep link (Wi-Fi, a URL, a ticket). [S] NEW
67. **Static map / location block** — a map tile centered on a place or a live coordinate (transit, delivery, ISS already exists as data). [M] NEW
68. **Web-embed / iframe block (web/TV only)** — embed a Grafana panel or a web widget where the runtime allows it. [M] NEW
69. **Video / media player block (web/TV only)** — a looping clip or a stream for signage. [M] NEW
70. **Agenda-with-join block** — today's meetings with a "join" affordance / QR for the video link (calendar now carries the URL). ⭐ [S] EXT
71. **Transit / departures board** — next buses/trains/flights from a stop (pairs with provider #36). ⭐ [M] NEW
72. **Status-page / incident-timeline block** — service health + a timeline of recent incidents (ops boards). [S] NEW
73. **OKR / goal-tracker block** — objective + key-results progress, not just a single bar. [S] NEW
74. **Habit grid / streak block (persistent)** — a real habit tracker that stores history, not just a static grid. ⭐ [M] NEW
75. **Mood / check-in block** — tap-to-log mood/energy with a trend (personal wellbeing). ⭐ [M] NEW
76. **Poll / vote display + leaderboard** — show live results from an inlet or a connected tool. [S] NEW
77. **Menu / specials / pricing board** — food & retail signage blocks (lobby / office cafe). [S] NEW
78. **Wayfinding / directory block** — arrows + room/person directory for office signage (some exists; deepen). [S] EXT
79. **Block-level "changed" badge** — any block can show a tiny "↑ since you looked" delta, not just the digest block. ⭐ [S] EXT
80. **Per-block schedule** — show this block only during chosen hours/days (page schedules exist; bring to blocks). [S] EXT
81. **Authoring block states** — design the loading / empty / error / data variants of a block explicitly. [M] NEW
82. **Inline rich text + Markdown block** — bold/italic/links inside text, and a full Markdown block. [M] NEW
83. **Per-block click action (web/touch)** — open a URL, switch page, or run an automation on tap. [M] NEW
84. **Reusable component / master blocks** — define a "meeting card" once, stamp instances, edit-once-update-everywhere. ⭐ [L] FIX
85. **Save-as-snippet library** — save any styled block/group and reuse it across boards. [M] NEW
86. **Live stock/RSS ticker tape** — a continuously scrolling marquee bound to a feed. [S] NEW
87. **Weather radar / pollen / tide / surf detail blocks** — deepen the nature family with data already available. ⭐ [S] EXT

## Part F — The Studio Authoring Experience
*Make building a beautiful board fast, precise, and delightful.*

88. **Align & distribute tools** — left/center/right align + distribute-evenly across a selection (only equalize-width exists). [S] FIX
89. **Group / ungroup blocks** — move, style, and duplicate several blocks as a unit. [M] FIX
90. **Smart guides, snapping & rulers** — alignment hints while dragging/resizing. [M] NEW
91. **Custom theme / look editor** — define a palette + typographic voice within the calm constraints; save as a reusable look. [L] EXT
92. **Typography fine controls** — line-height, letter-spacing, weight per block (within calm limits). [S] FIX
93. **Multiplayer editing** — presence cursors + live co-edit + conflict-free sync (single-user today). [L] FIX
94. **Comments & annotations on boards** — leave a note / @mention on a block; resolve threads. [M] NEW
95. **Version history v2** — named versions, visual diff, and side-by-side restore (restore exists; add diff + naming). [M] EXT
96. **Auto-layout / "tidy up"** — one click to balance columns, equalize gaps, and align a messy board. [M] NEW
97. **Bulk operations** — apply a style to all, swap one block type for another everywhere, multi-edit props. [S] EXT
98. **Find & replace text across a board** — and find a block by content/name. [S] NEW
99. **Mobile / tablet Studio editing** — a touch-friendly authoring mode (today editing on a phone is cramped). [L] FIX
100. **Interactive in-Studio tutorial** — a guided "build your first board" overlay. [S] NEW
101. **Keyboard-only authoring + a11y pass** — full keyboard reach + screen-reader labels in the editor. ⭐ [M] EXT
102. **Block/board search inside Studio** — jump to any object on a large board. [S] NEW
103. **Paste-image / drag-drop media** — drop an image onto the canvas to create an image block (uploads exist; smooth the flow). [S] EXT

## Part G — Boards, Pages & Organization
*Structure and reuse as your board count grows.*

104. **Board folders / collections / tags** — organize beyond a flat list. ⭐ [M] FIX
105. **Board search + filter + sort** — by name, content, connected app, last-edited. [S] NEW
106. **Favorites / pinned boards** — quick access to the ones you live in. [S] NEW
107. **Board archive (soft delete)** — hide without destroying; restore later. [S] NEW
108. **Global board variables / params** — one board, many screens, each with its own city/team/threshold. ⭐ [M] NEW
109. **Linked / shared components across boards** — a common header/footer/strip that updates everywhere. [M] NEW
110. **Personal template library** — save any of your boards as a private reusable template. [S] EXT
111. **Snippets & partials** — compose boards from saved sections (pairs with #85). [M] NEW
112. **Cross-board navigation (touch/web)** — a "home" board that links to others for kiosks. [S] NEW
113. **Board duplication across orgs / workspaces** — move a board from Personal to a team cleanly. [S] EXT
114. **Time-of-day board morphing** — a board that shifts content/look from morning → night beyond page rotation. ⭐ [M] NEW

## Part H — Templates, Onboarding & Content
*Get to a useful, live board in minutes.*

115. **Personalized template recommendations** — suggest boards based on the apps you connected (rule-based). ⭐ [M] NEW
116. **"Build my board" wizard** — pick your apps/goals → get a tailored, pre-bound board. ⭐ [M] NEW
117. **Template variables / fill-in-the-blanks** — on import, ask for the city/handle/repo and pre-bind everything. [M] NEW
118. **Sample-data preview** — see a template fully populated with realistic fake data before connecting anything. ⭐ [S] NEW
119. **Org template library** — a team's own shared, governed template set (beyond the global hub). [M] FIX
120. **Logged-out public gallery** — browse templates without an account (also good for discovery). [M] NEW
121. **Featured / seasonal templates** — a rotating curated shelf. [S] NEW
122. **Interactive onboarding checklist** — connect an app, claim a screen, set quiet hours — with progress. ⭐ [S] NEW
123. **Import from other tools** — TRMNL / Smashing / DAKboard board import where feasible. [M] NEW
124. **Template categories expansion** — more per category, especially home/personal/wellbeing to match the individual-first direction. ⭐ [S] EXT

## Part I — Screens & Fleet Management
*Run one screen or a hundred without friction.*

125. **Fleet dashboard** — health, battery, uptime, last-seen, current board across every screen at a glance. [M] EXT
126. **Per-screen content schedule** — this screen shows board A 9–5, board B after, board C weekends (device schedule exists; richer UI). ⭐ [M] EXT
127. **Fleet content calendar** — a what-shows-when calendar across the whole fleet. [M] NEW
128. **Bulk screen settings edit** — change refresh/timezone/quiet-hours for many screens at once. [S] EXT
129. **Bulk provisioning** — pre-generate claim codes, batch-claim, name-by-pattern for rollouts. [M] NEW
130. **Nested groups / tags for screens** — organize a large fleet hierarchically. [S] EXT
131. **Kiosk lock + tamper alerts** — prevent exit-to-home and alert if a screen is unplugged/moved. [M] NEW
132. **Proof-of-play analytics + export** — richer reporting for signage compliance. [M] EXT
133. **Remote screen control depth** — reboot, re-pair, push-now, identify, clear-cache from the app. [S] EXT
134. **OTA / firmware management** — manage native-shell versions across devices. [L] NEW
135. **Screen orientation auto-detect** — rotate the board to match how the panel is mounted. [S] NEW

## Part J — Collaboration & Teams
*Multiplayer and org capabilities (product, not pricing).*

136. **Org-wide board publishing / shared library** — publish a board to the whole team, not just 1:1 email shares. ⭐ [M] FIX
137. **Org-wide shared state** — team-wide custom-data and shared connections so a team board reflects shared numbers. [M] EXT
138. **Per-board / granular permissions** — beyond org roles: who can edit *this* board / push to *that* screen. [M] EXT
139. **Board activity feed + @mentions** — who changed what, with comments (pairs with #94). [M] NEW
140. **Audit log** — who added a member, deleted a board, changed a screen — for trust & ops. [M] FIX
141. **Approval workflow** — board changes get reviewed before they go live on shared screens. [M] NEW
142. **SSO / SAML / SCIM** — enterprise sign-in & user provisioning (product capability). [L] NEW
143. **Guest / external viewers + password links** — anonymous read-only links with a password (today sharing is account-only). [M] FIX
144. **Org branding / defaults** — a team logo on screens, default look, default quiet hours. [S] NEW
145. **Ownership transfer & offboarding** — reassign a leaving member's boards/screens cleanly. [S] NEW
146. **Team usage dashboard** — which boards/screens are actually used (deepens the minimal metrics page). [M] EXT

## Part K — Personalization & "Your Day"
*Lean into the individual-first, calm-companion direction.*

147. **Personal home board that follows you** — a "my glance" board available on any screen you sit at. ⭐ [M] NEW
148. **Generated daily brief** — your calendar + inbox + tasks + weather composed into a calm morning summary (rule-based, no AI). ⭐ [M] NEW
149. **Focus mode** — one tap hides noise (alerts, social, busy blocks) for deep work; auto-on during calendar focus time. ⭐ [M] NEW
150. **Routines** — morning/evening sequences that set boards, objects, and quiet state (Shortcuts-style for your wall). ⭐ [M] NEW
151. **Native goals & habits system** — persistent goals/habits with streaks, not just static blocks (pairs with #74). ⭐ [M] NEW
152. **Personal metrics journal** — log your own numbers (weight, mood, focus hours) and trend them over time. ⭐ [M] NEW
153. **Reflection / journaling block + prompts** — a calm end-of-day prompt and a place to answer it. ⭐ [S] NEW
154. **Context-aware greeting & messaging** — the wall speaks to your actual day ("3 meetings, rain at 4, leave by 5:10"). ⭐ [S] EXT
155. **Personal presets** — your favorite blocks, your locations, your default look — one tap. [S] NEW
156. **Private data vault** — notes/values visible only to you, never on a shared screen. ⭐ [S] NEW

## Part L — Mobile & Companion
*The phone as capture, control, and glance.*

157. **Native mobile app (iOS/Android)** — beyond the PWA: push, widgets, capture. [L] NEW
158. **Home-screen glance widget** — a phone widget that mirrors a board's key data. ⭐ [M] NEW
159. **Mobile capture** — snap a photo into a photo block; quick-add a task/note/metric to the wall. ⭐ [M] NEW
160. **Phone-as-remote** — drive any screen (next page, refresh, run a scene) from your phone (remote exists; deepen). [S] EXT
161. **Cast from phone to any screen** — beam a board to a nearby display. [M] EXT
162. **Voice capture** — dictate a quick task/note to the wall via the OS assistant (device dictation, not our model). [M] NEW
163. **Apple Watch / wearable glance** — your next event + leave-by on the wrist. [M] NEW
164. **Phone geofence triggers** — the phone itself drives presence/arrive/leave automations. ⭐ [S] EXT
165. **Full board viewer on mobile** — see any board (not just live data) on the phone. [S] EXT

## Part M — Trust, Privacy & Reliability
*The "private" pillar — a differentiator, not a footnote.*

166. **Local-only / on-prem data mode** — keep sensitive data off the cloud for those who need it. ⭐ [L] NEW
167. **Privacy dashboard** — see exactly what's stored, where, which connection touched what, and delete it. ⭐ [M] NEW
168. **GDPR / right-to-be-forgotten workflow** — a real export-and-erase flow (delete cascades exist; formalize). [M] FIX
169. **End-to-end encryption option** — for board content / private data at rest. [L] NEW
170. **Least-privilege connection scopes** — request the minimum OAuth scope and show users exactly what's accessed. ⭐ [S] EXT
171. **"What's on my screens right now" audit** — a privacy view of what every screen is currently showing. ⭐ [S] NEW
172. **Status / uptime transparency page** — public health + incident history. [S] NEW
173. **Granular data export** — per-board, per-connection, per-screen export (full backup exists; add granularity). [S] EXT
174. **Secret rotation + breach-response tooling** — rotate keys, revoke sessions, force re-auth. [M] EXT
175. **Verifiable-trust signals** — reproducible builds / open core / a clear data-handling statement surfaced in-app. ⭐ [S] NEW

## Part N — Platform & Extensibility
*Let others (and you) build on GlanceOS.*

176. **Public API depth** — full CRUD on boards/screens/data/automations with docs & SDKs (scoped keys exist; broaden). [M] EXT
177. **Custom block SDK** — define your own block/component and register it in the Studio. [L] FIX
178. **Provider SDK / plugin system** — add a data provider without a core code change. [L] FIX
179. **Outbound webhook subscriptions** — emit events (screen offline, value crossed, board changed) to your endpoint. [M] NEW
180. **Embeddable boards** — iframe a live board into another site/intranet. [M] NEW
181. **CLI / infrastructure-as-code** — define boards/screens/automations as code for repeatable rollouts. [M] NEW
182. **Theme / look marketplace** — share and install community looks. [M] NEW
183. **Template marketplace depth** — ratings, collections, attribution, install counts. [M] EXT
184. **API playground / developer sandbox** — try endpoints and preview block rendering live. [S] NEW
185. **BYO render pipeline** — self-host the e-ink render service for air-gapped fleets. [M] EXT

## Part O — Cross-cutting polish (small, high-fit)
186. **Large-board performance** — virtualize/lazy-render very large boards (full doc in memory today). [M] FIX
187. **Undo-history pruning** — bound the undo stack so long sessions don't grow unbounded. [S] FIX
188. **Stale-while-revalidate + ETag for data fetches** — smoother updates, fewer flickers. [S] EXT
189. **Better empty / first-run states** — every page teaches the next step. ⭐ [S] EXT
190. **Accessibility sweep across the runtime** — contrast, reduced-motion, screen-reader for the wall itself. ⭐ [M] EXT
191. **Per-block "last updated" + connection badge on the wall** — a quiet trust signal that data is fresh. ⭐ [S] NEW
192. **Keyboard-shortcut customization** — let power users remap Studio keys. [S] NEW
193. **In-app changelog / "what's new"** — surface shipped features to users. [S] NEW
194. **Onboarding "sample screen"** — a virtual screen so a new user sees the full loop before owning hardware. ⭐ [S] NEW

---

*194 features across 15 Parts (A–O). AI/LLM features deliberately excluded. We build in batches of ~20 — the Top-20 shortlist above is batch 1; ask for "the next 20" anytime and I'll rank the following batch.*
