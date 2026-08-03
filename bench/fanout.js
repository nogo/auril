// Scenario 3 — fan-out. What does a bare `watch()` cost per *idle* component?
//
// Two variants over the same tree and the same store patch:
//   broad   every component subscribes with `this.watch()`      → all N render()
//   scoped  every component subscribes with `this.watch(sel, …)` → 1 renders
//
// Exactly one component's output changes per patch, so both variants do
// identical *useful* work. The difference is the tax: N-1 render() calls whose
// strings update()'s memo throws away.
//
// Kernel time only: from store.set() to the end of the microtask that notifies
// subscribers and morphs. Layout and paint are deliberately excluded — this
// measures auril, not the renderer.

import { html, AurilElement, Store } from '../src/index.js';
import { measure, ms } from './lib.js';

const store = new Store({ items: /** @type {number[]} */ ([]) });
AurilElement.store = store;

/** Component counts to sweep, so the shape of the curve is visible, not one point. */
const COUNTS = [10, 50, 200];

class BenchCell extends AurilElement {
  #index = 0;

  onConnect() {
    this.#index = Number(this.dataset.index);
    if (this.dataset.mode === 'scoped') {
      this.watch((/** @type {any} */ s) => s.items[this.#index], () => this.update());
    } else {
      this.watch();
    }
  }

  render() {
    // Three elements and three interpolations — a plausible leaf component, not
    // a single text node. The tax scales with render() size, so measuring an
    // unrealistically tiny render would flatter the broad variant.
    const value = store.state.items[this.#index];
    return html`
      <span class="i">#${this.#index}</span>
      <span class="v">${value}</span>
      <span class="s">${value % 2 === 0 ? 'even' : 'odd'}</span>`;
  }
}
customElements.define('bench-cell', BenchCell);

/** set() schedules one microtask; a resolved promise lands us just after it. */
const tick = () => Promise.resolve();

/**
 * @param {{ host: Element, count: number, mode: 'broad' | 'scoped', samples: number, warmup: number }} opts
 */
async function measureVariant({ host, count, mode, samples, warmup }) {
  store.set({ items: Array.from({ length: count }, () => 0) });
  await tick();

  host.replaceChildren();
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const cell = document.createElement('bench-cell');
    cell.dataset.index = String(i);
    cell.dataset.mode = mode;
    frag.append(cell);
  }
  host.append(frag);
  await tick();

  let last = 0;
  const result = await measure((i) => {
    last = i + 1;
    const target = i % count;
    store.set((s) => {
      const items = s.items.slice();
      items[target] = last;
      return { items };
    });
    return tick();
  }, { samples, warmup });

  // A benchmark that silently measures nothing is worse than no benchmark:
  // prove the last patch actually reached the DOM.
  const cell = host.children[(last - 1) % count];
  if (!cell?.textContent?.includes(String(last))) {
    throw new Error(`bench/fanout: DOM did not update in "${mode}" mode — measured nothing`);
  }

  host.replaceChildren();
  await tick();
  return result;
}

/**
 * @param {{ samples?: number, warmup?: number }} [opts]
 */
export async function runFanout({ samples = 40, warmup = 10 } = {}) {
  const host = document.getElementById('bench');
  if (!host) throw new Error('bench/fanout: no #bench host element');

  const sizes = [];
  for (const count of COUNTS) {
    const broad = await measureVariant({ host, count, mode: 'broad', samples, warmup });
    const scoped = await measureVariant({ host, count, mode: 'scoped', samples, warmup });
    sizes.push({
      count,
      broad,
      scoped,
      // Cost of one extra subscribed-but-unaffected component, in microseconds.
      taxPerIdleComponentUs: ((broad.p50 - scoped.p50) / (count - 1)) * 1000,
    });
  }

  const budget = { count: 50, maxP95Ms: 8 };
  const target = sizes.find((s) => s.count === budget.count);

  return {
    name: 'fanout',
    title: 'Scenario 3 — fan-out (one patch, N subscribed components)',
    note: 'Per-patch ms. broad = this.watch(); scoped = this.watch(selector, cb).',
    columns: ['components', 'broad p50', 'broad p95', 'scoped p50', 'scoped p95', 'tax / idle'],
    rows: sizes.map((s) => [
      String(s.count),
      ms(s.broad.p50),
      ms(s.broad.p95),
      ms(s.scoped.p50),
      ms(s.scoped.p95),
      `${s.taxPerIdleComponentUs.toFixed(1)} µs`,
    ]),
    verdict: {
      label: `${budget.count} components, broad p95 ≤ ${budget.maxP95Ms} ms` +
        (target ? ` (actual ${ms(target.broad.p95)} ms)` : ''),
      pass: !!target && target.broad.p95 <= budget.maxP95Ms,
      hard: true,
    },
    raw: { sizes, budget },
  };
}
