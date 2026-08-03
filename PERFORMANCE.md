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
   84–91 % of changing every row. Idiomorph parses the new string and walks both
   trees regardless of how little differs.
3. **Morph costs 5–7× `innerHTML`** for the same final DOM — it does everything
   `innerHTML` does (parse the string) *plus* build id maps and diff. That
   multiplier is the price of preserving node identity and focus, which
   `innerHTML` cannot do at any speed.
4. **Fan-out is negligible.** Scoped cost is flat in N; broad cost is linear at
   ~1.4 µs per idle subscribed component, reaching the 8 ms budget somewhere
   around 5 000 components.

(2) and (3) together are the basis for the **~250-node per-component ceiling**
in FRAMEWORK.md Conventions, and (4) is why paying the fan-out tax to get there
is the right trade.

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

## Decisions this closes

| Question | Answer | Evidence |
|---|---|---|
| Optimise `` html`` `` / `render()`? | **No** | 2–3 % of update cost |
| Weaken or remove `update()`'s memo? | **Never** | It is what skips the other 97 % |
| Add kernel API to reduce fan-out (auto-scoping, dirty-tracking)? | **No** | ~1.4 µs per idle component; budget not reached until ~5 000 |
| Document a rule against bare `watch()`? | **No** | Same; the rule would cost clarity and buy nothing |
| Swap morph for `innerHTML` anywhere a component re-renders? | **No** | Measured loss of node identity and focus |
| Adopt Elena-style template-part patching? | **Not yet** | Closer than previously argued — it skips the parse, which is most of the cost. Still forfeits keyed pairing and `moveBefore()`, and the 250-node rule solves the same problem for zero lines |

## Revisit triggers

| If this happens | Measure first | Then consider |
|---|---|---|
| A view genuinely cannot stay under ~250 nodes per component | Split-into-N vs single component, same view | Virtualisation before any kernel change |
| Sustained rAF re-rendering becomes a real app requirement | dbmonster in Firefox; **separate parse cost from diff cost** | Parts-based renderer — this would be instance #2 (see below) |
| Idiomorph gains template caching or a pre-parsed-input API | Scenarios 1–2 | Bump it; most of the 5–7× is the parse |
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
- **Parse cost is not separated from diff cost** inside morph. That split is the
  most valuable next measurement — it decides whether template caching would
  recover most of the 5–7×, or none of it.
- The benchmark tree carries an `<input>` and a stable `id` per row. Both are
  representative of auril's documented conventions, and both cost Idiomorph
  extra work.
