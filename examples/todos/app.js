import { html, AurilElement, Store } from '../../src/index.js';

/** @typedef {{ id: number, text: string, done: boolean }} Todo */
/** @typedef {'all' | 'active' | 'done'} Filter */

const store = new Store(
  {
    filter: /** @type {Filter} */ ('all'),
    query: '',
    todos: /** @type {Todo[]} */ ([
      { id: 1, text: 'Try editing me (double-click)', done: false },
      { id: 2, text: 'Notice focus surviving re-renders', done: false },
      { id: 3, text: 'Read FRAMEWORK.md', done: true },
    ]),
  },
  { persist: ['todos'], key: 'auril-todos' },
);
AurilElement.store = store;

const FILTERS = /** @type {const} */ ([
  ['all', 'All'],
  ['active', 'Active'],
  ['done', 'Done'],
]);

class TodoApp extends AurilElement {
  /** Component-local state: which todo is being edited. Not the store's business. */
  #editingId = /** @type {number | null} */ (null);
  /** The unsaved new-todo draft — local too, but it must be bound in render(). */
  #draft = '';

  onConnect() {
    this.watch(); // shared state: re-render on any store change

    // New todo: native form submit (Enter in the input).
    this.on(this, 'submit', (event) => {
      event.preventDefault();
      const input = /** @type {HTMLInputElement | null} */ (this.querySelector('.new-todo'));
      const text = input?.value.trim();
      if (!input || !text) return;
      this.#draft = '';
      store.set((s) => ({
        todos: [...s.todos, { id: Math.max(0, ...s.todos.map((t) => t.id)) + 1, text, done: false }],
      }));
      // The store patch re-renders with value="", but the input still has focus
      // and ignoreActiveValue shields a focused value from the morph — clear it
      // directly as well.
      input.value = '';
    });

    // The draft lives in a field purely so render() can bind it. An *unbound*
    // input inside a re-rendering region is a bug: Idiomorph clears any input
    // whose new markup carries no value attribute, so a half-typed draft would
    // vanish on the first re-render after it loses focus. No update() call here
    // — the DOM already shows what was typed.
    this.delegate('input', '.new-todo', (_, el) => {
      this.#draft = /** @type {HTMLInputElement} */ (el).value;
    });

    // Search-as-you-type: every keystroke patches the store, which re-morphs
    // this whole component. Safe because (a) the value is bound in render()
    // (`value="${query}"`), so the input survives re-renders while blurred,
    // and (b) morph never overwrites the *focused* element's value
    // (ignoreActiveValue), so typing — including async updates landing
    // mid-keystroke — never loses characters or the cursor.
    this.delegate('input', '.search', (_, el) => {
      store.set({ query: /** @type {HTMLInputElement} */ (el).value });
    });

    this.delegate('change', '.toggle', (_, el) => {
      const id = this.#rowId(el);
      store.set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
    });

    this.delegate('click', '.destroy', (_, el) => {
      const id = this.#rowId(el);
      store.set((s) => ({ todos: s.todos.filter((t) => t.id !== id) }));
    });

    this.delegate('dblclick', 'label', (_, el) => {
      this.#editingId = this.#rowId(el);
      this.update(); // local state changed — re-render without touching the store
      const edit = /** @type {HTMLInputElement | null} */ (this.querySelector('.edit'));
      edit?.focus();
      edit?.setSelectionRange(edit.value.length, edit.value.length);
    });

    this.delegate('keydown', '.edit', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key === 'Enter') this.#commitEdit();
      if (event.key === 'Escape') {
        this.#editingId = null;
        this.update();
      }
    });

    this.delegate('focusout', '.edit', () => this.#commitEdit());

    this.delegate('click', '.filter', (_, el) => {
      store.set({ filter: /** @type {Filter} */ (el.getAttribute('data-filter')) });
    });

    this.delegate('click', '.clear-done', () => {
      store.set((s) => ({ todos: s.todos.filter((t) => !t.done) }));
    });
  }

  /** @param {Element} el @returns {number} id parsed from the enclosing li's "todo-N" */
  #rowId(el) {
    return Number(el.closest('li')?.id.split('-')[1] ?? -1);
  }

  #commitEdit() {
    const id = this.#editingId;
    if (id === null) return;
    const input = /** @type {HTMLInputElement | null} */ (this.querySelector('.edit'));
    if (!input) return;
    const text = input.value.trim();
    this.#editingId = null;
    store.set((s) => ({
      todos: text
        ? s.todos.map((t) => (t.id === id ? { ...t, text } : t)) // edit
        : s.todos.filter((t) => t.id !== id),                    // emptied → delete
    }));
  }

  /** @param {Todo} todo */
  #row(todo) {
    if (this.#editingId === todo.id) {
      return html`<li id="todo-${todo.id}"><input class="edit" value="${todo.text}"></li>`;
    }
    // `${todo.done ? 'checked' : ''}` is the boolean-attribute case: the
    // interpolated text is a literal flag, never data. Interpolated *values*
    // always go in quotes — see the Conventions section of FRAMEWORK.md.
    return html`
      <li id="todo-${todo.id}" class="${todo.done ? 'done' : ''}">
        <input class="toggle" type="checkbox" ${todo.done ? 'checked' : ''}>
        <label>${todo.text}</label>
        <button class="destroy" aria-label="Delete">×</button>
      </li>`;
  }

  render() {
    const { todos, filter, query } = store.state;
    const visible = todos
      .filter((t) => (filter === 'active' ? !t.done : filter === 'done' ? t.done : true))
      .filter((t) => t.text.toLowerCase().includes(query.toLowerCase()));
    const doneCount = todos.filter((t) => t.done).length;
    return html`
      <h1>todos</h1>
      <form><input class="new-todo" value="${this.#draft}" placeholder="What needs to be done?" autocomplete="off" autofocus></form>
      <input class="search" type="search" value="${query}" placeholder="Search…" autocomplete="off">
      <ul class="todo-list">${visible.map((t) => this.#row(t))}</ul>
      ${todos.length > 0 && html`
        <footer>
          ${FILTERS.map(([key, label]) => html`
            <button class="filter" data-filter="${key}" aria-pressed="${filter === key}">${label}</button>`)}
          <span class="spacer"></span>
          ${doneCount > 0 && html`<button class="clear-done">Clear done (${doneCount})</button>`}
        </footer>`}
    `;
  }
}

/** Separate component, own slice subscription — updates independently of TodoApp. */
class TodoStats extends AurilElement {
  onConnect() {
    this.watch((s) => s.todos, () => this.update());
  }

  render() {
    const { todos } = store.state;
    const left = todos.filter((t) => !t.done).length;
    return html`<p>${left} ${left === 1 ? 'item' : 'items'} left of ${todos.length}</p>`;
  }
}

customElements.define('todo-app', TodoApp);
customElements.define('todo-stats', TodoStats);
