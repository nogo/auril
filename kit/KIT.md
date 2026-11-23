# auril.js kit

Components that two or more apps need, vendored one by one beside the kernel.
They are not the kernel: they do not count against its 600-line budget, and the
kernel never imports them.

## Rules

- **Two-app rule, as for the kernel.** A component enters the kit when two
  apps carry the same code today. Until then it lives in the app.
- **Vendored per component.** `./kit.sh ../app/web/kit a2ui confirm` copies
  the named components and the files they need. The destination sits beside
  the app's `auril/` folder, because kit files import `../auril/index.js`.
- **Platform first.** A kit component draws with plain elements (`<dialog>`,
  `<input type="date">`, `<fieldset>`) and adds only the behaviour the
  platform lacks.

## Components

### base — `tokens.css`, `base.css`

The token contract and the house styles, named after the A2UI catalog.
`UI.md` is the guideline: tokens, classes, states, recipes and the starter.
A new app gets them from `./new-app.sh`; `a2ui` brings them along.

### a2ui — `<a2ui-surface>`, `check()`

Draws an [A2UI v1.0](https://a2ui.org/specification/v1.0-a2ui/) surface from
the basic catalog. An agent sends UI as data; the kit draws it with its own
code, so nothing the agent writes runs.

```js
import { check } from './kit/a2ui.js';     // also defines <a2ui-surface>

const why = check(source);                  // '' when it can be drawn
const markup = why
  ? html`<pre>${source}</pre><p>${why}</p>`
  : html`<a2ui-surface data-source="${source}"></a2ui-surface>`;

el.apply(message);                          // one more message, for a stream
el.addEventListener('a2ui-action', (e) => send(e.detail));  // { version, action }
```

- The source is one JSON value (a message or an array) or JSON Lines.
- Each surface draws into its own **shadow root**. A parent's morph never
  wipes it, on any kernel version, and the host's CSS never reaches in.
- **It looks like the app.** The shadow root links `base.css` then
  `a2ui.css`, and the page's tokens (`tokens.css`) inherit into it. The page
  must load `tokens.css`; an app with other names maps them in its `:root`
  (`--danger: var(--error);`).
- **Media:** `A2uiSurface.mediaUrl` decides which `Image`, `Video` and
  `AudioPlayer` URLs load. The default follows the A2UI guide: http(s) with a
  host, `data:`, or a same-host path. An app that must not reach other hosts
  replaces it.
- **Actions:** a Button's event fires `a2ui-action` with the A2UI action
  message, its context resolved at the click. `openUrl` runs only from a
  click, for http and https, with `noopener,noreferrer`.
- **Not covered:** function calls between renderer and agent, catalog
  negotiation, `sendDataModel` (read `el.data`), TR35 date patterns beyond
  the common tokens, and the regex safety rules 3 and 4 (overlapping
  alternation and adjacent quantifiers).

### confirm — `Confirm`

Two-tap confirm for a destructive button: the first tap shows "Sure?" in place,
the second does the work. It falls back after three seconds, on Escape, and
when focus leaves. From budget's and invest's `arm.js`.

```js
#confirm = new Confirm(() => this.update(), { sure: 'Sicher?' });
onConnect() {
  this.#confirm.wire(this);
  this.delegate('click', '[data-confirm]', (_, el) => {
    if (this.#confirm.tap(el.dataset.confirm)) this.#delete(el.dataset.confirm);
  });
}
render() { return this.#confirm.button(`tx-${id}`, 'Delete transaction', icon('delete')); }
```

### icons — `icon(name, size?)`

Line icons as inline SVG in `currentColor`, named as A2UI's basic catalog
names them (`mail`, `delete`, `calendarToday`, …). Drawn from Lucide (ISC,
notice in `LICENSE.lucide`). Decorative: the button around an icon names it.
