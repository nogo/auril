# Coding standards

Base: [MDN JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide) and [TypeScript JSDoc reference](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html). Where this file is silent, they apply.
The framework contract, the size budget and the feature checklist live in [FRAMEWORK.md](FRAMEWORK.md). Performance decisions live in [PERFORMANCE.md](PERFORMANCE.md). This file does not repeat them.

## Check

`bun test && bunx tsc -p jsconfig.json` — must pass before a change is done.

## Measure

`wc -l src/*.js` — kernel size against the 600-line budget in FRAMEWORK.md.
No complexity or duplication tool is installed. Use the change test: name the next change, count the files and sites it touches with `grep`.
Mutation: no tool. Hand-mutate the 3–5 meaningful branches of a function before changing it, run `bun test <file>` after each flip, revert every flip.
Flakiness: `for i in $(seq 10); do bun test --randomize; done` — any failure is a bug.
Hotspots: `git log --since=3.months --name-only --format= | sort | uniq -c | sort -rn | head`.
Peak RSS: no command yet; the kernel runs inside apps. `bun run bench` (system Chrome via playwright-core) is the closest representative run. Budget: none yet.

## JavaScript

### Structure
- Plain ES modules, no build step. The files in `src/` ship as written.
- One concept per file in flat `src/`. Only `src/vendor/` is a subfolder.
- `src/index.js` re-exports the public API. Nothing else is public.
- Types are JSDoc inside the `.js` file, checked by strict `checkJs`. The only `.d.ts` is the hand-written `src/vendor/idiomorph.d.ts`.
- Platform globals missing from `lib.dom.d.ts` are read once at module top and cast to `any`, with a comment that names the API (see `router.js`).

### Naming
- Classes PascalCase (`AurilElement`, `Store`), functions and methods camelCase.
- Files are lowercase single words named after the concept (`store.js`, `morph.js`).
- Internal state uses `#private` fields and methods.
- Test names are sentences that state the behaviour: `'unsubscribe stops notifications'`.

### Comments
- Every exported module has a JSDoc header: what it is for, what it guarantees.
- Inline comments carry a non-obvious why, often a platform quirk (`addEventListener` with an aborted signal is a silent no-op).

### Errors
- Messages start with `[auril]`. Element errors name the tag: `` `[auril] <${this.localName}>: …` ``.
- Programmer misuse throws at once: a method called before connect or after disconnect, `start()` called twice, `watch()` without a store.
- Environment failures degrade silently: `localStorage` missing, quota exceeded, corrupt payload. Each empty `catch` has a comment that says what state survives.
- A failing `render()` goes to `reportError()`, wrapped with the original on `.cause`. It is never rethrown.
- A failing subscriber is caught and logged with `console.error`, so the rest of the batch runs.

### Lifetime
- Every listener is tied to an `AbortSignal`. Element listeners use the connect-scoped `this.signal`; `Store` owns an `AbortController` released by `destroy()`.
- A caller-provided `opts.signal` is combined with `AbortSignal.any`, never replaced.

### Tests
- `bun:test`, one file per module: `test/<module>.test.js`.
- DOM comes from happy-dom, preloaded by `test/setup.js` (`bunfig.toml`).
- A platform API happy-dom lacks gets a fake on `globalThis` before a dynamic `import()` of the module (see `test/router.test.js`).
- Wait for a microtask with `await tick()`, never a timer.
- Assert through the public API only: DOM content, store state, `reportError` calls.

### Dependencies
- Zero runtime dependencies. The one third-party file is Idiomorph, vendored and pinned in `src/vendor/`.
- Dev tools stay `devDependencies` (happy-dom, playwright-core) or run on demand (`bunx tsc`). None is ever vendored.

## Overrides

- Seams for platform APIs (Navigation API, URLPattern, `localStorage`) are globals, not injected parameters. Tests replace the global. — The kernel mirrors the platform API shape on purpose, and an injection parameter would add interface for one test fake.
