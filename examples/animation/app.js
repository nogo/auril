// Animation demo: View Transitions animate list changes. Each card carries a
// unique view-transition-name, so when a morph moves/adds/removes it inside
// document.startViewTransition(), the browser animates old → new position.
// All state is component-local (private field + update()) — no store needed.
import { html, AurilElement } from '../../src/index.js';

class ShuffleGrid extends AurilElement {
  #cards = Array.from({ length: 12 }, (_, i) => i + 1);
  /** @type {ViewTransition | null} */
  #transition = null;

  onConnect() {
    this.delegate('click', '.shuffle', () => {
      this.#mutate((cards) => cards.toSorted(() => Math.random() - 0.5));
    });
    this.delegate('click', '.sort', () => {
      this.#mutate((cards) => cards.toSorted((a, b) => a - b));
    });
    this.delegate('click', '.add', () => {
      this.#mutate((cards) => [...cards, Math.max(0, ...cards) + 1]);
    });
    this.delegate('click', '.card', (_, el) => {
      const n = Number(el.getAttribute('data-n'));
      this.#mutate((cards) => cards.filter((c) => c !== n));
    });
  }

  /**
   * Apply a change and morph inside a View Transition. A running transition is
   * skipped first: while one animates, the browser displays its snapshot
   * pseudo-elements *over* the page, so DOM updates made underneath stay
   * invisible until it finishes — rapid clicks would look laggy even though
   * the DOM is current. skipTransition() ends it instantly, then a fresh
   * transition animates the new change from wherever things visually are.
   * @param {(cards: number[]) => number[]} fn
   */
  #mutate(fn) {
    this.#cards = fn(this.#cards);
    if (!document.startViewTransition) return this.update();
    this.#transition?.skipTransition();
    const transition = document.startViewTransition(() => this.update());
    this.#transition = transition;
    transition.finished.finally(() => {
      if (this.#transition === transition) this.#transition = null;
    });
  }

  render() {
    return html`
      <p class="controls">
        <button class="shuffle">Shuffle</button>
        <button class="sort">Sort</button>
        <button class="add">Add</button>
        <span>— click a card to remove it</span>
      </p>
      <ul class="grid">
        ${this.#cards.map((n) => html`
          <li id="card-${n}" class="card" data-n="${n}"
              style="view-transition-name: card-${n}; --h: ${(n * 137) % 360}">${n}</li>`)}
      </ul>`;
  }
}

customElements.define('shuffle-grid', ShuffleGrid);
