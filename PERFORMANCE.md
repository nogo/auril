# Performance

What auril.js actually costs, measured rather than assumed, so future changes
argue against data. Companion to [ALTERNATIVES.md](./ALTERNATIVES.md) (what else
we could use) and [FRAMEWORK.md](./FRAMEWORK.md) (the contract).

Regenerate with `bun run bench`: it prints these tables and rewrites
`bench/results.json`. Only the interpretation below is hand-maintained.

## Baseline — 2026-08

Chrome 150 headless, macOS, **4× CPU throttle** (the target profile: a mid-range
phone, not this laptop). All figures are p50 milliseconds per operation, kernel
time only — layout and paint excluded.

The tables below are one representative run; `bench/results.json` holds the most
recent, and it will differ within the ~15 % noise band described at the end. Do
not chase exact agreement between the two — read the ratios and shares, which
reproduce, rather than the absolute milliseconds, which do not.

### 1 — Wide update: every row changes (`bench/tree.js`)

| Nodes | render | morph | innerHTML | morph ÷ innerHTML |
|---|---|---|---|---|
| 250 | 0.105 | 6.2 | 1.10 | 5.6× |
| 1000 | 0.475 | 31.9 | 4.80 | 6.6× |

### 2 — Narrow update: one row of N changes

| Nodes | render | morph | innerHTML | morph ÷ innerHTML |
|---|---|---|---|---|
| 250 | 0.115 | 5.1 | 1.07 | 4.8× |
| 1000 | 0.433 | 26.8 | 3.80 | 7.1× |

Node identity and focus after one update — **morph: both kept. innerHTML: both
lost.** Asserted by the benchmark, not assumed.

### 4 — Where morph's time goes: parse vs walk (`bench/split.js`, wide churn)

Idiomorph accepts a Node as well as a string, and the Node path skips
`parseContent()` entirely, so `parse = morph(string) − morph(nodes)` is an exact
separation rather than an inference. The clone supplying a fresh tree per run is
excluded from the timing (Idiomorph consumes the content it is given).

| Nodes | string bytes | from string | from nodes | parse | parse share | template floor |
|---|---|---|---|---|---|---|
| 250 | 11 702 | 4.9 | 4.4 | 0.5 | 10 % | 0.9 |
| 1000 | 46 986 | 26.5 | 22.8 | 3.7 | 14 % | 3.0 |

`template floor` is `template.innerHTML = str` — the cheapest possible parse of
the same string. At 1000 nodes Idiomorph's parse (3.3–3.7 across runs) sits at or
only just above that floor (3.0–3.1), so despite `parseContent()` doing a
whole-string SVG-stripping regex and a full `DOMParser` document parse rather
than a template assignment, it costs little more than the minimum. **There is no
meaningful win in the parse path either — not upstream, not locally.**

**The 250-node parse figure is noise**: a difference of two ~5 ms measurements,
and it lands *below* the theoretical floor, which is impossible except by
measurement error. The 1000-node row is the load-bearing one. The split itself
reproduced across runs at 40 and 60 samples (14 % / 13 %), so the conclusion is
not an artefact of one run even though the individual figures move.

Cross-check on the harness: scenario 1 measures morph at 1000 nodes through
`src/morph.js` (26.8 ms), scenario 4 measures it through Idiomorph directly
(26.5 ms). The wrapper adds nothing and both scenarios measure the same thing.

### 3 — Fan-out: one store patch, N subscribed components (`bench/fanout.js`)

| Components | broad p50 | broad p95 | scoped p50 | scoped p95 | tax / idle component |
|---|---|---|---|---|---|
| 10 | 0.140 | 0.200 | 0.120 | 0.160 | 2.2 µs |
| 50 | 0.181 | 0.281 | 0.129 | 0.176 | 1.1 µs |
| 200 | 0.400 | 0.680 | 0.129 | 0.143 | 1.4 µs |

`broad` = `this.watch()`, `scoped` = `this.watch(selector, cb)`.

## What the numbers say

1. **Building the string is free; applying it is everything.** `render()` is
   2–3 % of an update. `update()`'s string memo skips the *morph*, not the
   render — it is therefore the single highest-value line in the kernel.
2. **Morph cost tracks tree size, not change size.** Changing one row costs
   84–97 % of changing every row across runs. Idiomorph parses the new string
   and walks both trees regardless of how little differs.
3. **Morph costs 5–7× `innerHTML`** for the same final DOM — it does everything
   `innerHTML` does (parse the string) *plus* build id maps and diff. That
   multiplier is the price of preserving node identity and focus, which
   `innerHTML` cannot do at any speed.
4. **The walk is 86–90 % of morph; the parse is 10–14 %.** Handing morph
   pre-parsed content recovers only the small share. This is the single most
   consequential number here: it means caching parses is not the lever, and it
   is why the ceiling in (5) is the whole mitigation rather than a stopgap.
5. **Fan-out is negligible.** Scoped cost is flat in N; broad cost is linear at
   ~1.4 µs per idle subscribed component, reaching the 8 ms budget somewhere
   around 5 000 components.

(2) and (4) are the basis for the **~250-node per-component ceiling** in
FRAMEWORK.md Conventions — if the cost is a tree walk that runs in full
regardless, the only lever is a smaller tree. (5) is why paying the fan-out tax
to split a view into several components is the right trade.

## Corrections to earlier assumptions

Recorded so they are not re-derived. Both were stated confidently in review
before being measured, and both were wrong.

- **"Morph only pays for what changed."** False — see (2). Any argument of the
  form "the update is small, so the morph is cheap" is invalid. The correct
  form is "the *tree* is small, so the morph is cheap."
- **"If morph does not beat `innerHTML` on a narrow update, Idiomorph is not
  earning its place."** A bad test, and it fails. Morph loses on raw time at
  every size measured and is still correct to keep: the justification is state
  preservation, not speed. Read the table with the identity/focus result beside
  it or it argues for the opposite of the truth.
- **"Most of the 5–7× is the parse."** Written into this file's own revisit-
  trigger table before being measured, and **false**: the parse is 10–14 %
  (scenario 4). The practical consequences of getting this wrong would have been
  real — it made "wait for a template-caching Idiomorph" look like a fix worth
  waiting for, and made parts-based rendering look like a ~14 % win when it is
  closer to a whole-cost win, because parts renderers skip the *walk* too.

## Decisions this closes

| Question | Answer | Evidence |
|---|---|---|
| Optimise `` html`` `` / `render()`? | **No** | 2–3 % of update cost |
| Weaken or remove `update()`'s memo? | **Never** | It is what skips the other 97 % |
| Add kernel API to reduce fan-out (auto-scoping, dirty-tracking)? | **No** | ~1.4 µs per idle component; budget not reached until ~5 000 |
| Document a rule against bare `watch()`? | **No** | Same; the rule would cost clarity and buy nothing |
| Swap morph for `innerHTML` anywhere a component re-renders? | **No** | Measured loss of node identity and focus |
| Change `morph()` to accept pre-parsed nodes? | **No** | Would recover 10–14 %, cost an API change, and `src/morph.js` is string-only by construction (`String(content)`). Not worth it |
| Adopt Elena-style template-part patching? | **Not yet, but the case is stronger than the parse figure suggests** | Parts renderers skip the tree walk, not just the parse — that is 86–90 %, not 14 %. Still forfeits keyed pairing and `moveBefore()`, and the 250-node rule caps the exposure for zero lines |

## Revisit triggers

| If this happens | Measure first | Then consider |
|---|---|---|
| A view genuinely cannot stay under ~250 nodes per component | Split-into-N vs single component, same view | Virtualisation before any kernel change |
| Sustained rAF re-rendering becomes a real app requirement | dbmonster in Firefox — allocation/GC, which scenario 4 does *not* cover | Parts-based renderer — this would be instance #2 (see below) |
| Idiomorph gains template caching or a pre-parsed-input API | Nothing | **Ignore it** — measured at 10–14 % (scenario 4). Not the lever |
| Idiomorph changes how it *walks* (cheaper id-maps, early-exit on unchanged subtrees) | Scenarios 1, 2, 4 | Bump it — the walk is 86–90 %, so this is where upstream gains would come from |
| DOM Parts ships cross-browser | Everything | Native templating — the biggest possible shrink |
| TC39 Signals reaches Stage 3 and ships | Scenario 3 against a `Signal.State` store | Swap the `store.js` backend; its API is already constrained to allow this |

**On the two-instance trigger.** ALTERNATIVES.md counts observed morph-model
pain toward a two-instance threshold for adopting template parts, with the
Firefox/dbmonster GC sawtooth as instance #1. These benchmarks are **not**
instance #2: they quantify the *same* phenomenon (parse-per-update plus a
full-tree walk) rather than surfacing a new one. The threshold still stands at
one.

## Known limits of these measurements

Read the numbers with these in mind before acting on a difference.

- **Run-to-run spread is ~15 %** on the morph figures across three consecutive
  runs. Treat anything under that as noise, not a regression.
- **Chrome only, headless, one machine.** Firefox is known to behave worse on
  this workload (ALTERNATIVES.md: cycle-collector sawtooth under sustained
  rAF). Safari is unmeasured.
- **p50/p95 describe batch means**, because Chrome clamps `performance.now()` to
  100 µs unless the page is cross-origin isolated. Rare single-operation spikes
  are therefore invisible.
- **Layout and paint are excluded.** These measure auril, not the renderer; real
  frame cost is higher.
- **The 250-node parse figure is noise.** It is a difference of two ~5 ms
  measurements whose own run-to-run spread is ~15 %. Only the 1000-node row
  supports a firm parse/walk split.
- **Scenario 4 measures time, not allocation.** The Firefox pain recorded in
  ALTERNATIVES.md is GC pressure from throwing away a parsed tree every frame —
  a ~14 % time cost can still be a much larger *allocation* cost. Nothing here
  contradicts that finding, and nothing here measures it.
- The benchmark tree carries an `<input>` and a stable `id` per row. Both are
  representative of auril's documented conventions, and both cost Idiomorph
  extra work.
