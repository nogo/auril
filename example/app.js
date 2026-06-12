import { html, AurilElement, Store } from '../src/index.js';

/** @typedef {{ id: number, text: string, done: boolean }} Todo */
/** @typedef {'all' | 'active' | 'done'} Filter */

const store = new Store(
  {
    filter: /** @type {Filter} */ ('all'),
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

  onConnect() {
    this.watch(); // shared state: re-render on any store change

    // New todo: native form submit (Enter in the input).
    this.on(this, 'submit', (event) => {
      event.preventDefault();
      const input = /** @type {HTMLInputElement | null} */ (this.querySelector('.new-todo'));
      const text = input?.value.trim();
      if (!input || !text) return;
      store.set((s) => ({
        todos: [...s.todos, { id: Math.max(0, ...s.todos.map((t) => t.id)) + 1, text, done: false }],
      }));
      input.value = '';
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
    return html`
      <li id="todo-${todo.id}" class="${todo.done ? 'done' : ''}">
        <input class="toggle" type="checkbox" ${todo.done ? 'checked' : ''}>
        <label>${todo.text}</label>
        <button class="destroy" aria-label="Delete">×</button>
      </li>`;
  }

  render() {
    const { todos, filter } = store.state;
    const visible = todos.filter((t) => (filter === 'active' ? !t.done : filter === 'done' ? t.done : true));
    const doneCount = todos.filter((t) => t.done).length;
    return html`
      <h1>todos</h1>
      <form><input class="new-todo" placeholder="What needs to be done?" autocomplete="off" autofocus></form>
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
