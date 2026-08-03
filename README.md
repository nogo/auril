# auril.js

A no-build frontend kernel for personal apps.

auril.js is a tiny set of browser-native primitives for building small
stateful web apps without npm, a bundler, transpilation, JSX, a virtual DOM, or
a component compiler. Files ship as plain ES modules. The debugger shows the
same source you wrote.

The kernel is intentionally small: top-level `src/*.js` currently fits in 338
lines, plus one vendored DOM morphing file.

## Why

Personal apps rarely need a framework stack. They need a few boring pieces:

- safe HTML string composition
- non-destructive DOM updates
- custom elements with lifecycle cleanup
- one shared store
- a small History API router
- event delegation
- debug logging when requested

auril.js provides those pieces and stops there. Everything app-specific stays
in the app.

## Principles

- **No build step.** The files in `src/` are the files that run.
- **Platform first.** Prefer HTML, CSS, custom elements, forms, `<dialog>`,
  `popover`, `:has()`, View Transitions, and browser validation before adding
  JavaScript.
- **One store, light DOM, morphed strings.** Components read shared state,
  render HTML strings, and morph their own light DOM.
- **Vendored, pinned, never published.** Apps copy the kernel deliberately.
  No registry, no auto-update.
- **Source-only.** auril.js does not ship a minified artifact. If an app needs
  minification, that app owns the build step; the kernel stays readable source.
- **Small by rule.** Kernel code has a hard 600-line budget for top-level
  `src/*.js`.

See [FRAMEWORK.md](./FRAMEWORK.md) for the full contract, and
[ALTERNATIVES.md](./ALTERNATIVES.md) for the researched landscape of
alternative tiny-kernel approaches (why string+morph, and when to revisit).

## Quick Start

Clone the repo and serve it with the bundled dev server (live reload + SPA
deep-link fallback):

```sh
bun serve.js
```

Then open:

```text
http://localhost:8000/examples/    demo gallery — todos, counter, async, router, animation, dbmonster
```

Enable debug logging with:

```text
http://localhost:8000/examples/todos/?auril-dev
```

No Bun? Any static server works, e.g. `python3 -m http.server` — but it has no
live reload and 404s on routed deep links (refreshing `/v/personal/`), so it
cannot develop a `Router` app.

## Example

```js
import { html, AurilElement, Store } from './auril/index.js';

const store = new Store(
  { count: 0 },
  { persist: ['count'], key: 'counter-store' },
);

AurilElement.store = store;

class CounterApp extends AurilElement {
  onConnect() {
    this.watch();
    this.on(this, 'click', () => {
      store.set((s) => ({ count: s.count + 1 }));
    });
  }

  render() {
    return html`<button>Count: ${store.state.count}</button>`;
  }
}

customElements.define('counter-app', CounterApp);
```

```html
<counter-app></counter-app>
<script type="module" src="./app.js"></script>
```

## Modules

### `html`, `raw`, `escapeHtml`

`html` is a tagged template for safe HTML strings. Interpolated values are
escaped by default. Arrays join. `null`, `undefined`, and `false` render as
nothing. Nested `html` template results compose without double escaping.

```js
const item = (todo) => html`<li id="todo-${todo.id}">${todo.text}</li>`;
const list = html`<ul>${todos.map(item)}</ul>`;
```

Use `raw(str)` only for trusted markup, such as sanitized markdown renderer
output. Never wrap user input in `raw()`.

Always **quote interpolated attributes** — `class="${x}"`, never `class=${x}`.
Escaping covers `&<>"'` but not spaces or `=`, so an unquoted attribute value is
an injection vector escaping cannot close.

### `morph`

`morph(target, content, options?)` updates a target element's children to match
an HTML string while preserving focus, selection, scroll, and node identity.
The focused element's value is never overwritten (`ignoreActiveValue`), so an
input that triggers a re-render on every keystroke keeps its text, cursor, and
IME composition; the value resyncs from markup on blur. Bind such inputs in
markup (`value="${s.query}"`) so they also stay correct while not focused.

Give repeated items stable `id` attributes so reorders pair the right nodes:

```js
html`<li id="todo-${todo.id}">${todo.text}</li>`;
```

### `AurilElement`

`AurilElement` is a custom-element base class for light-DOM components.

```js
class TodoList extends AurilElement {
  onConnect() {
    this.watch((s) => s.todos, () => this.update());
  }

  render() {
    return html`...`;
  }
}
```

Useful methods:

- `this.on(target, type, handler)` adds an event listener and removes it
  automatically on disconnect.
- `this.delegate(type, selector, handler)` delegates events to matching
  descendants and removes the listener automatically on disconnect — prefer it
  over bare `delegate(this, …)` inside a component.
- `this.watch()` re-renders on any store change.
- `this.watch(cb)` calls `cb(state)` on any store change.
- `this.watch(selector, cb)` calls `cb(slice, state)` only when the selected
  slice changes by `===`.
- `this.update()` morphs the element to match `render()` — skipped when the
  rendered string is unchanged, so broad `watch()` subscriptions stay cheap.

Component-local state should live in private fields:

```js
class EditorPanel extends AurilElement {
  #editingId = null;
}
```

Shared state belongs in `Store`.

### `Store`

`Store` is a small observable state container. Updates are batched per
microtask, so multiple synchronous `set()` calls produce one notification.

```js
const store = new Store(
  { filter: 'all', todos: [] },
  { persist: ['filter'], key: 'todos-store', version: 1 },
);

store.set({ filter: 'done' });
store.set((s) => ({ todos: [...s.todos, todo] }));

const unsubscribe = store.subscribe((state) => {
  console.log(state);
});
```

Persistence uses `localStorage` for selected keys. Storage failures degrade
silently to in-memory state. An optional `version` discards incompatible saved
data (defaults win) when you bump it after a persisted shape changes, instead
of hydrating stale data. A subscriber that throws is caught and logged, so one
bad subscriber never blocks the others in a batch.
Persisted slices also sync across browser tabs: a `storage` event from another
tab re-applies the saved keys (last write wins; non-persisted keys untouched).

### `Router`

`Router` is a small client-side router built on the Navigation API and
`URLPattern` (Baseline newly available 2026).

```js
const router = new Router()
  .route('/v/:vault/', ({ vault }) => showHome(vault))
  .route('/v/:vault/review/:year', ({ vault, year }) => showReview(vault, year))
  .notFound((path) => showMissing(path))
  .start();

router.go('/v/personal/');
```

One `navigate` listener intercepts same-origin navigations — link clicks,
back/forward, and `go()`. Hash-only changes, downloads, form submissions, and
cross-origin navigations are left to the browser, as are unmatched paths when
no `notFound` handler is registered.

### `delegate`

`delegate(root, type, selector, handler)` handles events from matching
descendants.

```js
delegate(this, 'click', '.destroy', (event, button) => {
  removeTodo(button.closest('li').id);
});
```

`delegate(root, …)` is the bare helper. Inside an `AurilElement`, prefer
`this.delegate(type, selector, handler)`, which scopes to the element and removes
the listener on disconnect; bare `delegate(this, …)` stacks listeners across
reconnects.

### `dev`

Debug logging is opt-in:

```js
dev.enabled = true;
dev.log('store.set', patch);
```

Or add `?auril-dev` to the URL. When enabled, `AurilElement` logs each
connect / disconnect / update, and every `Store` registers itself at
`globalThis.__auril[key]` for console inspection (`__auril['todos-store'].state`).

## Vendoring Into An App

auril.js is meant to be copied into apps, not installed from a registry.

```sh
./vendor.sh ../budget/web/auril
```

The script copies `src/`, `FRAMEWORK.md`, and `LICENSE` into the destination.
Your app then imports:

```js
import { html, AurilElement, Store } from './auril/index.js';
```

Upgrade deliberately by re-running `vendor.sh` and reviewing the diff like any
dependency bump.

## Development

Run the dev server (static files, live reload, SPA deep-link fallback):

```sh
bun serve.js [port]   # default port 8000
```

Run tests:

```sh
bun test
```

Run type checking:

```sh
bunx tsc -p jsconfig.json
```

Check the kernel line budget:

```sh
wc -l src/*.js
```

## Project Layout

```text
src/
  html.js        escaped HTML template helper
  morph.js       Idiomorph wrapper
  element.js     AurilElement
  store.js       observable store
  router.js      History API router
  delegate.js    event delegation helper
  dev.js         opt-in debug logging
  index.js       public exports
  vendor/        pinned third-party code
examples/        demo gallery (todos, counter, async, router, animation, dbmonster); examples/todos/ is the canonical usage reference
test/            bun tests
FRAMEWORK.md     compact canonical framework contract
vendor.sh        copy kernel into an app
serve.js         static dev server (live reload, SPA fallback)
```

## Guardrail For Changes

Do not add to the kernel because something might be useful later. A feature
belongs in `src/` only when it is needed by at least two apps today, awkward to
do with the platform alone, understandable in one reading, and small enough to
fit the line budget.

Every kernel change must update [FRAMEWORK.md](./FRAMEWORK.md). Undocumented
behavior is not part of the framework.

## License

MIT — see [LICENSE](./LICENSE). `vendor.sh` copies the license file into the
destination, so vendored copies carry the notice MIT requires.

`src/vendor/idiomorph.js` is Idiomorph v0.7.4 under Zero-Clause BSD, which
imposes no notice requirement of its own.
