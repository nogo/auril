// DBMonster: the classic re-render stress test (github.com/mathieuancelin/js-repaint-perfs).
// Every animation frame mutates the data and re-renders the whole table
// through render() + morph — no keyed tricks, no partial updates. The FPS
// counter shows what the string+morph pipeline sustains.
//
// NOT A PATTERN TO COPY. This deliberately breaks the ~250-node per-component
// ceiling in FRAMEWORK.md Conventions: at roughly 35 nodes per row it renders on
// the order of 1,500 nodes from a single component at the default 40 rows, and
// about double that at 80. Being over the ceiling is the point of a stress test.
// Morph cost tracks tree size, not change size (PERFORMANCE.md), so expect 60fps
// on a desktop and well short of it on a mid-range phone. A real view this large
// belongs in several components with watch(selector, cb), so that each morph
// walks a small tree and untouched slices never morph at all.
import { html, AurilElement } from '../../src/index.js';

const QUERIES = [
  'SELECT blah FROM something',
  'UPDATE users SET rank = 4',
  'DELETE FROM sessions WHERE stale',
  '<IDLE> in transaction',
  'vacuum',
  'COMMIT',
];

/** @typedef {{ elapsed: number, query: string }} Query */

/** @returns {Query} */
function randomQuery() {
  return { elapsed: Math.random() * 15, query: QUERIES[Math.floor(Math.random() * QUERIES.length)] };
}

/** @param {number} count @returns {Query[]} top-5 slowest of `count` random queries */
function sampleQueries(count) {
  return Array.from({ length: count }, randomQuery)
    .sort((a, b) => b.elapsed - a.elapsed)
    .slice(0, 5);
}

class DbMonster extends AurilElement {
  #rows = 40;
  #dbs = /** @type {{ name: string, queries: Query[] }[]} */ ([]);
  #fps = 0;
  #frames = 0;
  #lastStamp = 0;

  onConnect() {
    this.#seed();
    this.delegate('click', '[data-rows]', (_, el) => {
      this.#rows = Number(el.getAttribute('data-rows'));
      this.#seed();
    });
    const loop = () => {
      if (this.signal?.aborted) return; // stops with the element
      this.#tick();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  #seed() {
    this.#dbs = Array.from({ length: this.#rows }, (_, i) => ({
      name: `cluster${Math.floor(i / 2) + 1}${i % 2 ? ' slave' : ' master'}`,
      queries: sampleQueries(5),
    }));
  }

  #tick() {
    for (const db of this.#dbs) {
      if (Math.random() < 0.5) db.queries = sampleQueries(Math.floor(Math.random() * 12));
    }
    const now = performance.now();
    this.#frames++;
    if (now - this.#lastStamp >= 1000) {
      this.#fps = this.#frames;
      this.#frames = 0;
      this.#lastStamp = now;
    }
    this.update();
  }

  /** @param {number} count */
  #countClass(count) {
    return count >= 10 ? 'red' : count >= 5 ? 'orange' : 'green';
  }

  render() {
    return html`
      <p class="controls">
        ${[20, 40, 80].map((n) => html`
          <button data-rows="${n}" aria-pressed="${n === this.#rows}">${n} rows</button>`)}
        <strong class="fps">${this.#fps} fps</strong>
      </p>
      <table>
        ${this.#dbs.map((db, i) => html`
          <tr id="db-${i}">
            <td class="name">${db.name}</td>
            <td><span class="count ${this.#countClass(db.queries.length)}">${db.queries.length}</span></td>
            ${db.queries.map((q) => html`
              <td class="q ${q.elapsed > 10 ? 'red' : q.elapsed > 5 ? 'orange' : ''}">
                ${q.elapsed.toFixed(2)}<span class="popover">${q.query}</span>
              </td>`)}
          </tr>`)}
      </table>`;
  }
}

customElements.define('db-monster', DbMonster);
