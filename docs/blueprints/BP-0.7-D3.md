# BLUEPRINT BP-0.7-D3: direction "Night Shift"

Read `docs/blueprints/BP-0.7-common.md` first; it binds you. Your directory:
`site/proto/d3/`.

## Concept
**You're the on-call engineer for a fleet of agents.** The course is your
console: incidents page you, you replay the trace, find the first bad event,
ship a fix to the harness, and prove it on the dashboards. Fun is the
detective work, the satisfying "resolved", and beating par times, inside a
calm, well-designed control room (think the best of modern observability
tools, not a hacker cliché). Dark-first; a light "day shift" theme is optional.

## Palette (night; day shift optional)
- Background `#0B0F14`; panels `#121821` with 1 px `#222C38` borders;
  raised panels `#18212C`; ink `#E6EBF1`; secondary `#9AA6B4`;
  grid lines `#1C2530`.
- Wires (Okabe-Ito based, assigned for color-vision separation) — exact:
  control `#E69F00`, context `#56B4E9`, loop `#0072B2`, errors `#D55E00`,
  tools `#F0E442`, permissions `#CC79A7`, verify `#C9CED6`, observe `#009E73`.
  (Loop is the darkest: draw loop marks with a 1 px `#7FB4E0` outline so they
  read on the dark panel.)
- Status: ok `#3FB950`, fail `#F85149`, warn `#D29922`; always with a mark and
  a word. The page alert (incident) uses warn with a slow 2 s pulse.

## Type
- **Inter** (`@fontsource-variable/inter`): UI and prose 16 px phone / 17 px
  desktop (dark backgrounds need slightly smaller, heavier-looking text; use
  weight 420–450 if variable), headings 600; `tabular-nums` everywhere numbers
  appear.
- **JetBrains Mono** (`@fontsource/jetbrains-mono`): logs, trace rows, JSON,
  big metric numerals (700, 28–40 px).
- If a package doesn't exist, report it and use `@fontsource/inter` (static).

## Layout
- Home is the **shift console**: a top status bar (shift time, "1 page open"),
  a prominent **page card** ("PAGE · run b2-spiral has called tools 14 times
  and hasn't stopped" with "Acknowledge" as the primary action → break.html),
  a **system status grid** = the Harness Board: 8 tiles in turn order, each
  with glyph, wire name, health (modules installed, "2 cards due" shown as a
  degraded badge), and the "Continue B2" card and path progress as a compact
  "runbook" list.
- Break is the **incident view**: header with incident title and a running
  "time to diagnose" clock that starts at Lock-in but is shown only after
  you finish (common brief); a **telemetry timeline** (8 lanes, events as
  glyph markers, a playhead line, scanline-free) and a **log tail** panel
  (mono rows, newest at the bottom, current row highlighted); the context bar
  as a "desk usage" gauge with % text; cost as a big numeral. Phone: the log
  tail is the main view, the 8-lane strip above it, transport sticky at the
  bottom.
- Prove is a **rollout dashboard**: old vs new as two columns ("control" vs
  "candidate"), Run ×20 as "Run canary ×20", trials as a 20-cell heatmap row
  per board, histograms in a Grafana-like style (thin bars, axis in mono),
  p50/p100 cost and turns as metric tiles. The par puzzle is framed as an
  **SLO**: "Set the turn-limit guard: lowest p100 cost without losing a
  passing run." Limit control = a stepper (− value +) plus a slider; the
  solution-space chart is a dark line chart with the feasible region shaded.
- On success: "Incident resolved" banner with time to diagnose vs par.

## Motion and juice
- Snappy: 120–200 ms, `cubic-bezier(.2,0,0,1)`; no bounce.
- Replay: each event drops its marker onto its lane (opacity + 3 px scale-in)
  and appends a log row; the playhead glides at the chosen speed.
- Page alert: a slow pulse on the page card only (no flashing; ≤ 1 cycle per 2 s).
- Resolved: the incident header turns from warn to ok with a 300 ms crossfade,
  the guard module slides into the loop tile, and the status grid tile goes
  healthy.
- Reduced motion: no pulse, no glide; markers and rows appear instantly.

## Voice
Calm on-call voice: factual, brief, no panic ("Page acknowledged. Let's look
at the trace."). Real terms everywhere.

## Avoid
Neon-on-black hacker clichés, red/green as the only status cue, pure black
`#000`, low-contrast grey text (secondary ink must stay ≥ 4.5:1), alarm
sounds, more than one pulsing element at a time, anything below 14 px.
