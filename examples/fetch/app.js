// Async data demo: loading / error / retry states, superseded-request
// cancellation, and a controlled search input. Everything here is
// component-local state — no store needed, which is the point: the store is
// for state *shared between* components.
import { html, AurilElement } from '../../src/index.js';
import { searchTeam } from './api.js';

class TeamSearch extends AurilElement {
  #query = '';
  #team = /** @type {{ name: string, role: string }[]} */ ([]);
  #status = /** @type {'loading' | 'error' | 'done'} */ ('loading');
  #error = '';
  /** @type {AbortController | null} */
  #ctrl = null;

  onConnect() {
    this.delegate('input', '.search', (_, el) => {
      this.#search(/** @type {HTMLInputElement} */ (el).value);
    });
    this.delegate('click', '.retry', () => this.#search(this.#query));
    this.#search('');
  }

  /** @param {string} query */
  async #search(query) {
    this.#query = query;
    this.#ctrl?.abort(); // a newer search supersedes the in-flight one
    const ctrl = (this.#ctrl = new AbortController());
    this.#status = 'loading';
    this.update();
    try {
      // this.signal cancels the request when the element disconnects.
      const team = await searchTeam(query, { signal: AbortSignal.any([ctrl.signal, /** @type {AbortSignal} */ (this.signal)]) });
      this.#team = team;
      this.#status = 'done';
    } catch (err) {
      if (/** @type {Error} */ (err).name === 'AbortError') return; // superseded or disconnected
      this.#status = 'error';
      this.#error = /** @type {Error} */ (err).message;
    }
    this.update();
  }

  render() {
    return html`
      <input class="search" type="search" value="${this.#query}"
             placeholder="Search the team… (type “fail” to see the error state)"
             autocomplete="off">
      ${this.#status === 'loading' && html`<p class="state" aria-busy="true">Loading…</p>`}
      ${this.#status === 'error' && html`
        <p class="state error">${this.#error} <button class="retry">Retry</button></p>`}
      ${this.#status === 'done' && html`
        <ul class="team">
          ${this.#team.map((m) => html`
            <li id="member-${m.name.replaceAll(' ', '-')}">
              <strong>${m.name}</strong> <span>${m.role}</span>
            </li>`)}
          ${this.#team.length === 0 && html`<li class="empty">No matches.</li>`}
        </ul>`}
    `;
  }
}

customElements.define('team-search', TeamSearch);
