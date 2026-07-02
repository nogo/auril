// Router demo: Navigation-API routing with params, deep links, back/forward.
// Refresh on a note URL — the dev server's SPA fallback serves this page and
// the router resolves the path on start(). Route changes cross-fade via View
// Transitions (built into Router, zero code here).
import { html, AurilElement, Store, Router } from '../../src/index.js';

const BASE = '/examples/router';

const NOTES = [
  { id: 1, title: 'Navigation API', body: 'One `navigate` listener intercepts link clicks, back/forward, and go(). No click hijacking, no popstate juggling.' },
  { id: 2, title: 'URLPattern', body: 'Routes use :param and * syntax natively — the pattern matching ships with the browser, not with the kernel.' },
  { id: 3, title: 'Deep links', body: 'Refresh this page: the server serves the app shell, and start() resolves the current URL to this view.' },
  { id: 4, title: 'View Transitions', body: 'Each route change is wrapped in document.startViewTransition when supported. The cross-fade you just saw costs the kernel 2 lines.' },
];

/** @typedef {{ name: 'list' } | { name: 'note', id: number } | { name: 'missing', path: string }} View */

const store = new Store({ view: /** @type {View} */ ({ name: 'list' }) });
AurilElement.store = store;

const router = new Router()
  .route(`${BASE}/`, () => store.set({ view: { name: 'list' } }))
  .route(`${BASE}/note/:id`, ({ id }) => store.set({ view: { name: 'note', id: Number(id) } }))
  // Scoped catch-all: only paths under this demo show the missing view.
  // Links elsewhere (e.g. back to /examples/) fall through to the browser.
  .route(`${BASE}/*`, (_, path) => store.set({ view: { name: 'missing', path } }))
  .start();

class NotesApp extends AurilElement {
  onConnect() {
    this.watch((s) => s.view, () => this.update());
    // Programmatic navigation goes through router.go() — same history and
    // view-transition path as a link click.
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
