// Router demo: Navigation-API routing with params, deep links, back/forward.
// Refresh on a note URL — the dev server's SPA fallback serves this page and
// the router resolves the path on start(). Route changes cross-fade: the app
// opts in by wrapping its update in a View Transition (see `show`).
import { html, AurilElement, Store, Router } from '../../src/index.js';

// Derived, not hardcoded: the demo works at any mount point (a path prefix
// like /auril/ on GitHub Pages) and on deep links, where relative URLs shift.
const BASE = new URL('.', import.meta.url).pathname.replace(/\/$/, '');

const NOTES = [
  { id: 1, title: 'Navigation API', body: 'One `navigate` listener intercepts link clicks, back/forward, and go(). No click hijacking, no popstate juggling.' },
  { id: 2, title: 'URLPattern', body: 'Routes use :param and * syntax natively — the pattern matching ships with the browser, not with the kernel.' },
  { id: 3, title: 'Deep links', body: 'Refresh this page: the server serves the app shell, and start() resolves the current URL to this view.' },
  { id: 4, title: 'View Transitions', body: 'This app wraps each route change in document.startViewTransition and returns updateCallbackDone, so the router finishes the navigation on the new DOM. The first view shows without one — it would cross-fade from a blank page. Handlers get the destination URL, so query state comes off url.searchParams.' },
];

/** @typedef {{ name: 'list' } | { name: 'note', id: number } | { name: 'missing', path: string }} View */

const store = new Store({ view: /** @type {View} */ ({ name: 'list' }) });
AurilElement.store = store;

let started = false;

/**
 * Show a view, cross-faded once the first view is up. Returning
 * updateCallbackDone makes the router finish the navigation (scroll restore,
 * focus reset) only after the new view is in the DOM.
 * @param {View} view
 */
function show(view) {
  if (!started || !document.startViewTransition) return store.set({ view });
  return document.startViewTransition(() => store.set({ view })).updateCallbackDone;
}

const router = new Router()
  .route(`${BASE}/`, () => show({ name: 'list' }))
  .route(`${BASE}/note/:id`, ({ id }) => show({ name: 'note', id: Number(id) }))
  // Scoped catch-all: only paths under this demo show the missing view.
  // Links elsewhere (e.g. back to /examples/) fall through to the browser.
  .route(`${BASE}/*`, (_, url) => show({ name: 'missing', path: url.pathname }))
  .start();
started = true;

class NotesApp extends AurilElement {
  onConnect() {
    this.watch((s) => s.view, () => this.update());
    // Programmatic navigation goes through router.go() — same history and
    // route handler as a link click.
    this.delegate('click', '.next', (_, el) => {
      router.go(`${BASE}/note/${el.getAttribute('data-id')}`);
    });
  }

  render() {
    const { view } = store.state;
    if (view.name === 'note') return this.#note(view.id);
    if (view.name === 'missing') {
      return html`
        <p>No view at <code>${view.path}</code>.</p>
        <p><a href="${BASE}/">← All notes</a></p>`;
    }
    return html`
      <ul class="notes">
        ${NOTES.map((n) => html`
          <li id="note-${n.id}"><a href="${BASE}/note/${n.id}">${n.title}</a></li>`)}
        <li><a href="${BASE}/nowhere">A broken link (scoped not-found)</a></li>
      </ul>`;
  }

  /** @param {number} id */
  #note(id) {
    const note = NOTES.find((n) => n.id === id);
    if (!note) return html`<p>Note ${id} does not exist.</p><p><a href="${BASE}/">← All notes</a></p>`;
    const next = NOTES[(NOTES.findIndex((n) => n.id === id) + 1) % NOTES.length];
    return html`
      <article>
        <h2>${note.title}</h2>
        <p>${note.body}</p>
      </article>
      <p>
        <a href="${BASE}/">← All notes</a>
        <button class="next" data-id="${next.id}">Next: ${next.title}</button>
      </p>`;
  }
}

customElements.define('notes-app', NotesApp);
