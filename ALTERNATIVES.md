# Alternatives Research

How tiny can a kernel get while keeping React-like ergonomics (state → UI,
components, events)? This file records the landscape as of **July 2026** so
future decisions argue against data, not vibes. Sizes are min+gzip;
`~` = secondary source; **?** = unverified.

auril.js baseline: **419 lines** kernel + Idiomorph v0.7.4 vendored (~3.3 KB),
model = render HTML strings → morph light DOM, no build step.

## Matrix

### Tagged-template renderers (same authoring model as auril)

| Library | Version (date) | Size | No-build | Rendering model | Typed-input safety | Maintenance | License |
|---|---|---|---|---|---|---|---|
| **uhtml** | 4.7.1 (Apr 2025) | ~2.5 KB | ✅ single ESM file, 0 deps | Keyed template *parts* — only dynamic bindings update, static HTML never re-parsed | Excellent: nodes are stable, morphing layer not needed at all | Active; single maintainer (WebReflection) = bus-factor risk | MIT |
| **lit-html 3 (standalone)** | 3.3.3 (~May 2026) | ~7.5 KB | ⚠️ needs a pre-bundled ESM file (esm.sh) to vendor | Same parts model, maximum battle-testing (~5.7M dl/wk) | Excellent | Very healthy, Google-backed | BSD-3 |
| **Arrow.js** | 1.0.6 (Apr 2026) | <5 KB (claimed) | ✅ no compiler | `reactive()` + `` html`` `` fine-grained updates | Good **?** | Just revived + pivoted to "agentic era" — direction unpredictable | MIT |
| **Reef.js** | 13.0.6 (~mid-2025) | ~2.6 KB | ✅ single file | render-to-string + own (simpler) DOM diff, `signal()` state | Moderate — diff less battle-tested than Idiomorph | Slow but deliberate | MIT |
| **hyperapp** | 2.0.22 (2023) | ~1 KB | ✅ ESM, but VDOM `h()` calls, no HTML templates | Elm-style single state + VDOM | Good | **Dormant ~3 yrs** | MIT |

### Signal-reactive

| Library | Version (date) | Size | No-build | Rendering model | Typed-input safety | Maintenance | License |
|---|---|---|---|---|---|---|---|
| **VanJS + vanX** | vanX 0.6.x **?** | **1.0 KB** (+1.2 vanX) | ✅ by explicit design, 0 deps | `van.state` + function composition (`div(...)`) — abandons HTML strings | Excellent (in-place bindings) | Active | MIT |
| **Preact + htm (+signals)** | Preact 10.2x, htm 3.1.1 | ~7 KB all-in (single-file standalone exists) | ✅ via import map or standalone file | VDOM + components + hooks/signals — the "actual React ergonomics" ceiling | Excellent | Preact very active; htm "done" | MIT |
| **Solid (`solid-js/html`, no compiler)** | 1.9.x | ~7.1 KB+ | ⚠️ tagged-template mode is second-class (loses compiler optimizations, getter quirks) | Fine-grained signals, no VDOM | Excellent | Very active | MIT |
| **TC39 signal-polyfill** | pre-1.0 | ~1–2 KB | ✅ single ESM | State layer only — no rendering; could replace `store.js` | n/a | "Not for production"; API tracks Stage-1 proposal | Apache-2.0 |

### Attribute-driven / server-driven (paradigm shift, not state→template)

| Library | Version (date) | Size | Model | Why (not) for auril | License |
|---|---|---|---|---|---|
| **Alpine.js** | 3.x (active) | ~15 KB | Directives in HTML (`x-data`, `x-model`), mutates in place | Solid choice, but 15 KB and logic lives in HTML attributes | MIT |
| **petite-vue** | 0.4.1 (frozen ~2022) | ~5.8 KB | Vue-lite directives | **Frozen** — disqualified for new adoption | MIT |
| **htmx 4** | 4.0 (~Apr 2026) | ? (2.x ~14 KB) | Server returns HTML, client swaps/morphs (Idiomorph now in core) | Needs a server — wrong fit for client-only personal apps; validates the morph approach | BSD-2 |
| **Datastar** | 1.0 | ~14.7 KB | Signals in attributes + SSE fragments | Server-driven; same mismatch as htmx | MIT |
| **fixi** | experimental | ~3–4 KB unminified | Minimal hypermedia controls | Interesting philosophically, no releases | BSD |

### Morphing engines (drop-in for the Idiomorph slot)

| Engine | Size | Focus safety | Verdict |
|---|---|---|---|
| **Idiomorph 0.7.4** (current) | ~3.3 KB | Best-in-class: id-set matching, `restoreFocus`, `ignoreActiveValue`, opportunistic `moveBefore()` | Keep. Now the htmx-4 core morpher and Turbo's basis |
| morphdom | ~3.9 KB | id-attribute only; known focus loss cases | Strictly worse here |
| nanomorph | ~1.5 KB | activeElement caveats | Dead (choojs ecosystem) |
| diffhtml | ~10+ KB | VDOM-style | Too big |
| morphlex | small **?** | claims better matching | Too young to bet on |

### Disqualified outright

Stencil (mandatory compiler), Microsoft FAST (deprecated in favor of Fluent
UI), Mavo/Strawberry (**?** likely inactive). Cami.js is a conceptual sibling
(light-DOM WC + observables + lit-html) worth a skim, maintenance unverified.

## Platform futures (what could shrink the kernel in 2–4 years)

| Proposal | Status (mid-2026) | Kernel impact |
|---|---|---|
| **TC39 Signals** | Stage 1, no Stage 2 in sight | Could eventually delete `store.js`; polyfill vendorable today but API churn |
| **DOM Parts** | Iterating, not shipped | Would make templating native — biggest possible shrink, not on a 2-yr horizon |
| **Template Instantiation** | Folded into DOM Parts | Don't wait |
| **`Element.moveBefore()`** | Chrome 133+, Firefox 144+, no Safari — not Baseline | Idiomorph 0.7.4 already uses it opportunistically; nothing to do |
| **Sanitizer API / `setHTML`** | Firefox 148 + Chrome ~146, no Safari | Could replace `html.js` escaping once Safari ships — recheck against auril's Safari 26.2 floor |

## Shortlist — actually worth evaluating

1. **uhtml** — best paradigm match. True keyed template parts at ~2.5 KB
   would *delete* the morph layer and the whole focus/input problem class.
   Trade-off: single maintainer; morphing arbitrary HTML strings (e.g.
   server-rendered fragments) is lost.
2. **lit-html standalone** — same argument, maximum battle-testing; costs 3×
   the size and awkward vendoring (pre-bundled ESM needed).
3. **Status quo (Idiomorph 0.7.4 + `ignoreActiveValue`)** — the null
   alternative. Focus/input safety is solved as of this revision; the
   string-morph model keeps render() trivially debuggable and
   server-fragment-compatible.
4. **VanJS + vanX** — proof that 1 KB suffices *if* you trade HTML strings
   for function composition. Strongest "smaller than auril" data point.
5. **Preact + htm + signals (single file)** — the ~7 KB ceiling giving real
   React ergonomics; the benchmark auril competes against.

## Concepts adopted / deferred (2026-07)

- **Adopted — render memoization** (from the parts-based renderers'
  "don't touch what didn't change"): `update()` skips the morph when render()
  output is string-identical to the last update.
- **Adopted — controlled-input convention** (from React/Alpine `x-model`):
  named canonical in FRAMEWORK.md Conventions; pattern only, no kernel code.
- **Adopted — signals-swappable store constraint** (from TC39 Signals): store
  API surface stays implementable on a future `Signal.State` backend.
- **Deferred — declarative morph-exempt regions** (from Reef's `reef-ignore`):
  a default `beforeNodeMorphed` callback skipping `data-morph-ignore` nodes,
  ~2 lines in morph.js. Waits for the two-app rule: adopt when a second app
  embeds a self-managed widget (contenteditable, chart lib).

## Measured: the morph model's real cost (2026-07, dbmonster)

`examples/dbmonster/` re-renders a full table through render()+morph every
animation frame. Results:

- **Chrome**: 60 fps steady at 40 and 80 rows — morph itself is not the
  bottleneck at personal-app scale.
- **Firefox (Zen)**: dips to ~50 fps, occasional ~19 fps drops. Profiler shows
  Incremental CC + sawtooth memory: every frame allocates a ~40 KB HTML string
  and Idiomorph parses it into a throwaway `<template>` tree (~600 nodes at
  80 rows ≈ 36k discarded nodes/s). Chrome's generational GC absorbs this;
  Firefox's cycle collector takes it out of the frame budget.

Interpretation: parse-per-update allocation is the morph model's inherent
cost, and it is exactly what parts-based renderers (uhtml/lit-html) avoid —
they parse templates once and touch only bindings. It only matters at
*sustained rAF frequency*; event-driven personal apps (keystrokes, clicks)
never approach it. Counts as **one** observed instance of morph-model pain
toward the two-instance revisit trigger below.

**Standing conclusion (2026-07):** the string+morph model stays. The genuine
future fork in the road is *template parts* (uhtml/lit-html today, DOM Parts
natively later): revisit when either the two-app rule surfaces morph-model
pain twice, or DOM Parts ships cross-browser.
