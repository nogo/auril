// The example screen, built from the recipes in kit/UI.md: a list with its
// three states (loading, failed, empty), a form that adds, and a two-tap
// delete. Rename it and replace the items with the app's own data.
import { AurilElement, html } from '../auril/index.js';
import { Confirm } from '../kit/confirm.js';
import { icon } from '../kit/icons.js';
import { store } from './state.js';
import * as api from './api.js';

async function loadItems() {
  try {
    store.set({ items: { list: await api.items(), error: '' } });
  } catch (err) {
    const error = err instanceof api.OfflineError ? 'You are offline.' : /** @type {Error} */ (err).message;
    store.set({ items: { list: store.state.items?.list ?? null, error } });
  }
}

class HomeScreen extends AurilElement {
  #confirm = new Confirm(() => this.update());
  #error = '';
  #saving = false;

  onConnect() {
    this.watch((s) => s.items, () => this.update());
    this.#confirm.wire(this);
    this.delegate('submit', 'form', (e, form) => {
      e.preventDefault();
      this.#add(/** @type {HTMLFormElement} */ (form));
    });
    this.delegate('click', '#retry', () => loadItems());
    this.delegate('click', '[data-confirm]', (_, el) => {
      const id = /** @type {HTMLElement} */ (el).dataset.confirm ?? '';
      if (this.#confirm.tap(id)) this.#delete(id.slice('item-'.length));
    });
    loadItems();
  }

  /** @param {HTMLFormElement} form */
  async #add(form) {
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (!name) return;
    this.#saving = true;
    this.#error = '';
    this.update();
    try {
      await api.addItem({ name });
      form.reset();
      await loadItems();
    } catch (err) {
      this.#error = /** @type {Error} */ (err).message;
    }
    this.#saving = false;
    this.update();
  }

  /** @param {string} id */
  async #delete(id) {
    try {
      await api.deleteItem(id);
    } catch (err) {
      this.#error = /** @type {Error} */ (err).message;
    }
    await loadItems();
  }

  render() {
    const items = store.state.items;
    return html`<div class="column">
      <h1>Items</h1>
      <form class="row" novalidate>
        <label class="field">
          <span class="label">New item</span>
          <input name="name" required autocomplete="off" aria-invalid="${String(this.#error !== '')}" aria-describedby="add-error">
          ${this.#error && html`<span id="add-error" class="error" role="alert">${this.#error}</span>`}
        </label>
        <button class="primary" ${this.#saving ? 'disabled' : ''} aria-busy="${String(this.#saving)}">${icon('add')}Add</button>
      </form>
      ${this.#list(items)}
    </div>`;
  }

  /** @param {typeof store.state.items} items */
  #list(items) {
    if (!items) return html`<div aria-busy="true"></div>`;
    if (items.error && !items.list) {
      return html`<div class="state error" role="alert"><p>Could not load the items: ${items.error}</p><button type="button" id="retry">Try again</button></div>`;
    }
    const list = items.list ?? [];
    if (list.length === 0) return html`<div class="state"><p>No items yet. Add the first one above.</p></div>`;
    return html`${items.error && html`<p class="banner warning" role="status">${items.error} Showing the last list.</p>`}
      <ul class="list">${list.map((/** @type {{ id: string, name: string }} */ it) => html`<li id="row-${it.id}" class="row">
        <span>${it.name}</span><span class="spacer"></span>${this.#confirm.button(`item-${it.id}`, `Delete ${it.name}`, icon('delete'))}
      </li>`)}</ul>`;
  }
}
customElements.define('home-screen', HomeScreen);
