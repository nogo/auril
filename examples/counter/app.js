// The smallest possible auril app: one store, one component, ~30 lines.
import { html, AurilElement, Store } from '../../src/index.js';

const store = new Store({ count: 0 }, { persist: ['count'], key: 'auril-example-counter' });
AurilElement.store = store;

class CounterApp extends AurilElement {
  onConnect() {
    this.watch(); // re-render on any store change
    this.delegate('click', '[data-step]', (_, el) => {
      const step = Number(el.getAttribute('data-step'));
      store.set((s) => ({ count: s.count + step }));
    });
    this.delegate('click', '.reset', () => store.set({ count: 0 }));
  }

  render() {
    const { count } = store.state;
    return html`
      <button data-step="-1" aria-label="Decrement">−</button>
      <output>${count}</output>
      <button data-step="1" aria-label="Increment">+</button>
      <button class="reset" ${count === 0 ? 'disabled' : ''}>Reset</button>
      <p>Persisted to localStorage — reload the page, the count survives.
         Open a second tab: the store syncs across tabs.</p>`;
  }
}

customElements.define('counter-app', CounterApp);
