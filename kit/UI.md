# UI standard

How every auril app looks and is built, so a new app starts from decisions,
not from a blank page. Read this before writing a screen. `ui-rules` holds the
quality floor (contrast, keyboard, motion); this file holds the shared shape.

**Standard:** token names, the class vocabulary, the app shell, the states, and
the recipes below. **Free:** token values (each app's look), layout of a
screen, domain components, charts. An app that needs something this file lacks
builds it in the app; when a second app builds the same thing, it moves here.

## Start a new app

```sh
./new-app.sh ../pantry "Pantry"      # from the auril repo
```

It copies `starter/` to `../pantry/web`, vendors the kernel to `web/auril` and
the kit's `base`, `confirm` and `icons` to `web/kit`. The app then has: the
app bar, a login screen, the session, the service worker with an update
banner, and one example screen built from the recipes. Rename the example
screen; keep the rest.

The starter expects this from the server, under the app's root:

| Request | Answer |
|---|---|
| `GET api/session` | `200 {"user": {"name": "…"}}`, or `401` when signed out |
| `GET auth/login` | the identity provider's sign-in, back to the app |
| `POST auth/logout` | `204`, and the session cookie gone |
| `GET api/…` | JSON; an error is `{"error": "why", "field": "name"}` with a 4xx |

All requests go through `js/api.js`. A `401` anywhere shows the login screen.

## Tokens

`kit/tokens.css` defines the names and default values. An app loads it first,
then sets values in its own `style.css`. **Never rename a token and never add
one for a colour;** a new colour need is a new value for an existing role.

| Group | Names |
|---|---|
| Surfaces | `--surface-sunken`, `--surface`, `--surface-raised` |
| Text, lines | `--text`, `--text-muted`, `--border`, `--border-strong` |
| Brand | `--accent`, `--on-accent`, `--accent-tint` |
| Status | `--success`, `--warning`, `--danger`, each with `-tint`; `--on-danger` |
| Other colour | `--focus`, `--shadow` |
| Type | `--font`, `--font-mono`, `--text-xs` … `--text-2xl`, `--leading` |
| Space | `--space-1` 0.25rem, `-2`, `-3`, `-4` 1rem, `-6`, `-8`, `-12` |
| Shape, size | `--radius`, `--radius-lg`, `--control`, `--measure`, `--page` |
| Motion | `--duration`, `--ease` |

- A fill has an `on-` partner: text on `--accent` is `--on-accent`. This is
  Material's role pairing, also shadcn's `-foreground` and daisyUI's `-content`.
- `-tint` is a quiet background for a selected row, a chip or a banner.
- Colours are OKLCH inside `light-dark()`. Dark mode follows the system through
  `color-scheme`; there is no `.dark` class and no second block.
- **An old app adopts the standard** by loading `kit/tokens.css` before its
  own stylesheet, and mapping names it already uses:
  `:root { --danger: var(--error); }`. It renames nothing in its own code.

## Vocabulary: the A2UI catalog

Classes are named after the components of the A2UI basic catalog, so an app
screen and an agent's `<a2ui-surface>` draw from one stylesheet
(`kit/base.css`). When an agent can show it, the app writes it the same way.

| A2UI | Markup | Notes |
|---|---|---|
| Text | `<p>`, `<h1>`–`<h4>`; `.caption` | one `<h1>` per screen |
| Image | `<img class="avatar">` | also `.icon`, `.small`, `.medium`, `.large`, `.header` |
| Icon | `icon('mail')` from `kit/icons.js` | the button around it carries the name |
| Row | `.row` | wraps; `.spacer` pushes the rest to the end |
| Column | `.column` | |
| List | `<ul class="list">` | rows divided by a line; `.list.horizontal` scrolls |
| Card | `.card` | an outline, so a card in a card stays distinct |
| Tabs | `[role=tablist]` with `[role=tab]` buttons | |
| Modal | `<dialog>` | open with `command="show-modal"` or `showModal()` |
| Divider | `<hr>`, `<hr class="vertical">` | |
| Button | `<button>`; `.primary`, `.borderless` | `.danger` for destructive work; `.button` makes a link look like one |
| TextField | `<label class="field">` with `.label`, the input, `.hint`, `.error` | |
| CheckBox | `<label class="check">` | |
| ChoicePicker | `<fieldset class="choices">` of `.choice` labels; `.chips` | radio for one, checkbox for many |
| Slider | `<span class="slider">` with range and `<output>` | inside a `.field` |
| DateTimeInput | `<input type="date">` / `time` / `datetime-local` | inside a `.field` |

Beyond A2UI, for the app's own furniture: `.app-bar`, `.page`, `.banner`
(`.warning`, `.danger`), `.state` (`.error`), `.sr-only`.

Every rule in `base.css` is inside `:where()`, so one class in the app's
`style.css` overrides it.

## Layout

- A container owns the space between its children with `gap` (Every Layout's
  rule). A child never sets its own outside margin.
- `.page` centres the screen, at most `--page` wide. Body text stops at
  `--measure`.
- A screen element sits in `.page` and renders one `.column` as its root, so
  its parts get space. Space: `--space-6` between sections,
  `--space-3` inside one, `--space-2` inside a control.
- Use `.row` and `.column` first. Write a grid in the app's CSS only when two
  axes must line up.

## States

Every region that loads shows one of four states. Never a blank region.

| State | Markup | When |
|---|---|---|
| Loading | `<div aria-busy="true"></div>` | before the first answer; base.css draws a spinner |
| Failed | `.state.error` with `role="alert"` and a "Try again" button | no data and an error |
| Empty | `.state` with one sentence that says what to do | the answer is an empty list |
| Stale | the data, and a `.banner.warning` above it | an error, but data from before |

- A button that waits for the server is `disabled` with `aria-busy="true"`.
- Offline shows in the app bar; the update banner offers "Update now". The app
  never reloads by itself.

## Recipes

**List screen.** A `.row` heading, an add form, then the list in its states.
Each row has a stable `id`. `starter/js/home.js` is this recipe.

**Form.** A `<form>` of `.field` labels, native validation first (`required`,
`type`, `:user-invalid`). On a server error, put the message in the field's
`.error` and set `aria-invalid="true"`. A short form is one `form.row`.

**Destructive action.** A two-tap `Confirm` from `kit/confirm.js`, not a
dialog: the first tap shows "Sure?" in place.

**Detail or edit.** A `<dialog>` for a short edit; a route of its own for
anything with more than a few fields.

**Agent UI.** An answer that holds UI is A2UI data, drawn by
`<a2ui-surface>` (`kit/a2ui.js`). Never draw model-written HTML.

## Rules for writing a screen

1. Use a class from the vocabulary before writing CSS. Write app CSS only for
   what the vocabulary lacks, and only with tokens; a hex value outside
   `:root` is a defect.
2. Every control is a `<button>`, `<a>`, `<input>`, `<select>` or `<textarea>`.
3. **In `` html`` ``, a string is text, so it is escaped.**
   `${busy ? 'aria-busy="true"' : ''}` renders broken quotes. Write the
   attribute in the template with the value interpolated:
   `aria-busy="${String(busy)}"`. Only bare flags like `disabled` may come
   from a condition.
4. Each list item has a stable `id`.
5. Run `ui-rules`' `check.sh` on the screen, light and dark, before calling it
   done.

## Where this comes from

- **Role tokens with an `on-` partner:** Material 3, shadcn/ui (`--primary` /
  `--primary-foreground`), daisyUI (`-content`), Web Awesome (`-on`).
- **Three surfaces, status trio:** Web Awesome's surface tiers and its
  success, warning and danger variants.
- **OKLCH and `light-dark()`:** shadcn/ui ships OKLCH; `light-dark()` replaces
  its `.dark` class with the platform.
- **Gap-owning containers:** Every Layout's Stack and Cluster, under A2UI's
  names Column and Row.
- **Classes for components, plain elements first:** Pico CSS styled bare HTML
  and is now archived, because "AI can generate lightweight, standalone,
  accessible HTML". So the standard is a contract an AI follows, not a
  framework that does the work.
- **Not adopted:** the Design Tokens format (DTCG 2025.10), a JSON file that
  a build step turns into CSS. With no build step, `tokens.css` is the source.
