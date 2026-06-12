# auril.js

A no-build frontend kernel for personal apps to kill the bloat.
Plain ES modules over web standards: **338 lines of kernel you own** (typed
via JSDoc), plus one vendored file (Idiomorph) for DOM morphing. No npm, no
bundler, no transpilation — the files that ship are the files you wrote.

This file is the complete documentation. It is deliberately short enough to
paste into an AI session as context — keep it that way.

## The Guardrail

auril.js stays useful only while it stays small. These rules ARE the framework;
breaking them is how every personal framework has died — by growing into the
bloat it was built to escape.

1. **Two-app rule.** Nothing enters the kernel until at least **two** apps
   need it *today*. Until then it lives in the app that wants it.
2. **Hard size budget: 600 lines** for the kernel (top-level `src/*.js`,
   excluding `src/vendor/`, `test/`, `example/` — check: `wc -l src/*.js`).
   To cross it, delete something first. No subfolders inside `src/` — that
   is how creep starts.
3. **Near-frozen.** Bug fixes are always welcome. Features must pass the
   checklist below — the default answer is **no**.
4. **App code stays in apps.** API layers, formatting helpers, components —
   never generalize them "for later".
5. **Vendored, pinned, never published.** Apps copy the kernel via
   `vendor.sh` and upgrade deliberately. No registry, no auto-update.
6. **This file is the contract.** Every kernel change updates FRAMEWORK.md in
   the same commit and adds a Versions entry. Undocumented = nonexistent.

Feature checklist — all must be yes:

- [ ] Needed by two or more apps **today** (not hypothetically)?
- [ ] Impossible or genuinely awkward with the platform alone?
- [ ] Under ~50 lines including comments?
- [ ] Understandable in one reading?
- [ ] FRAMEWORK.md updated in the same change?

## Design principles

- **No build step.** Files ship as written; the debugger shows your source;
  stack traces end in code you own.
- **Platform first.** `<dialog>`, `popover`, `:has()`, CSS nesting, form
  validation, View Transitions — reach for these before any JS. The kernel
  stays empty of what the platform already does.
- **Build for priors.** APIs mirror established idioms — lit-html's
  `` html`` ``, Redux's `subscribe`, htmx's `morph` — so humans *and* AI
  models can lean on what they already know. Only the deltas need docs.
- **One store, light DOM, morphed strings.** Components read shared state,
  render HTML strings, and morph the live DOM. No virtual DOM, no shadow DOM,
  no props plumbing.

## Modules

### html.js — `` html`` ``, `raw()`, `escapeHtml()`

Tagged template returning an HTML string. Interpolated values are
**escaped by default**; arrays join; `null`/`undefined`/`false` render as
nothing (`0` renders). Nested `` html`` `` results are *not* re-escaped, so
composition just works:

```js
const row = (t) => html`<li id="tx-${t.id}">${t.note}</li>`;
const list = html`<ul>${transactions.map(row)}</ul>`;
```

`raw(str)` marks trusted markup (e.g. rendered markdown). Never wrap user
input in `raw()`.

### morph.js — `morph(target, content, options?)`

Morphs `target`'s children to match an HTML string (Idiomorph,
`morphStyle: 'innerHTML'`). Non-destructive: preserves focus, selection,
scroll, and node identity. Two rules:

- Give list items **stable `id` attributes** (`id="tx-42"`) so reorders pair
  nodes correctly.
- Exempt self-managed regions (contenteditable, third-party widgets):
  `morph(el, content, { callbacks: { beforeNodeMorphed: (node) => node.id !== 'editor' } })`

### element.js — `AurilElement`

Custom-element base class. Assign the shared store **once** at startup:
`AurilElement.store = new Store({...})`.

```js
class MonthlyList extends AurilElement {
  onConnect() {                       // called on connect; cleanup in onDisconnect()
    this.watch((s) => s.yearMonth, () => this.update());  // re-render when slice changes
  }
  render() { return html`...`; }      // if defined, runs once on connect
}
customElements.define('monthly-list', MonthlyList);
```

- `this.on(target, type, handler, opts?)` — `addEventListener` auto-removed on
  disconnect (AbortController under the hood; `this.signal` is exposed). A
  caller-provided `opts.signal` is combined via `AbortSignal.any` — either
  signal removes the listener.
- `this.watch()` — re-render (`update()`) on **any** store change.
- `this.watch(cb)` — `cb(state)` on any store change.
- `this.watch(selector, cb)` — `cb(slice, state)` only when the selected
  slice changes (`===` comparison). For re-render-on-slice:
  `this.watch((s) => s.yearMonth, () => this.update())`.
- `this.update()` — `morph(this, this.render())`; logs the failing tag name
  on render errors.
- `on()` and `watch()` throw when called before connect — call them from
  `onConnect()`, never the constructor.

Light DOM only — global CSS applies; no shadow root.

### store.js — `Store`

```js
const store = new Store(
  { yearMonth: '2026-06', transactions: [] },        // defaults
  { persist: ['yearMonth'], key: 'budget-store' },   // localStorage slice
);
store.set({ yearMonth: '2026-07' });                 // patch
store.set((s) => ({ count: s.count + 1 }));          // functional patch
const unsub = store.subscribe((state) => ...);
```

Notifications are **batched per microtask**: N synchronous `set()` calls →
one notify with the final state. Persisted keys are hydrated on construction
and written **once per microtask batch** (same cadence as notifications);
storage failures (quota, tests) degrade silently to in-memory.

### router.js — `Router`

Client-side router built on the **Navigation API** and **URLPattern**
(`:param` and `*` syntax) — both Baseline newly available 2026 (Chrome 102+,
Firefox 147+, Safari 26.2+); no fallback. Wraps route changes in a View
Transition when supported.

```js
new Router()
  .route('/v/:vault/', ({ vault }) => show('home', { vault }))
  .route('/v/:vault/review/:year', ({ vault, year }) => show('review', { vault, year }))
  .notFound((path) => show('missing', { path }))
  .start();                            // also intercepts same-origin link clicks
router.go('/v/personal/');             // programmatic navigation
```

One `navigate` listener intercepts same-origin navigations — link clicks,
back/forward, and `go()`. Hash-only changes, downloads, form submissions,
cross-origin navigations, and modified clicks are left to the browser via the
platform's navigate-event flags rather than hand-rolled checks. An unmatched
path with no `notFound` handler falls through to a real browser navigation.
`start()` takes no options.

### delegate.js — `delegate(root, type, selector, handler)`

Event delegation: `handler(event, matchedElement)` when the event target
matches `selector` inside `root`.

### dev.js — `dev`

`dev.log(...)` prints `[auril]`-prefixed debug output (store patches, route
resolutions) when enabled. Enable with `?auril-dev` in the URL or
`dev.enabled = true`.

## Conventions

- All server data flows through one per-app `api.js`; components never
  `fetch` directly. (This seam is where offline-first slots in later.)
- **Component-local state** (open/closed, edit mode, drafts): private instance
  fields + `this.update()`. The store is for *shared* state only.
  ```js
  #editingId = null;
  startEdit(id) { this.#editingId = id; this.update(); }
  ```
- Stable `id`s on anything morph must track across renders.
- `raw()` only at trusted edges (markdown renderer output) — never user input.
- Modals, menus, tooltips: `<dialog>` and `popover` — zero kernel code.
- Forms: native validation (`required`, `:user-invalid`) before JS.

## Vendoring into an app

```sh
./vendor.sh ../app/web/auril
```

`src/` is the self-contained vendored unit: its contents (kernel +
`vendor/idiomorph.js`) are copied verbatim, plus this file (the pinned copy
records its version below). Apps import `./auril/index.js`. Upgrade by
re-running deliberately — diff the result like any dependency bump.

## DX: types without a build step

The kernel ships **JSDoc type annotations inside the `.js` files** — they
travel with vendoring and cost zero at runtime (nothing transpiles). With the
repo's `jsconfig.json` (strict `checkJs`), any TS-aware editor gives
autocomplete, signature help, and shape-checking; `Store` is generic, so
`new Store({ filter: '', todos: [] })` types `store.state` and every
`set()` patch against your actual state shape.

Verify headlessly (dev-time only; typescript is fetched on demand, never a
project dependency): `bunx tsc -p jsconfig.json`. Apps that vendor the kernel
add their own ~10-line `jsconfig.json` to get the same checking.

## Using with AI

Reference this file in the app's CLAUDE.md (or paste it at session start) —
it is the framework's entire context, ~2k tokens. The implementation is small
enough that the model should **read the kernel files directly** instead of
guessing: everything is within a few hundred lines. `example/app.js` is the
canonical usage reference — a complete todo app (CRUD, inline editing,
filters, persistence) showing every kernel piece and the local-state
convention in ~150 lines.
