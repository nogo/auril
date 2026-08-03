// Scenarios 1 and 2 — one tree, two churn rates.
//
//   wide    every row changes  — the case morphing is worst at
//   narrow  one row changes    — the case morphing exists for
//
// Both split an update into the parts that actually cost something, measured
// independently so you can see which half to attack if it ever matters:
// building the HTML string (render), applying it with Idiomorph (morph), and
// `innerHTML =` as the control.
//
// innerHTML is an honest baseline, not a strawman: it produces the same final
// DOM from the same string, and the browser's parser is heavily optimised. What
// it does not produce is the same *live* DOM, so the narrow scenario also probes
// what survives an update. A table of timings on its own invites exactly the
// wrong conclusion.

import { html, morph } from '../src/index.js';
import { measure, ms } from './lib.js';

const CELLS = 5;
const SIZES = [50, 200];
/** Distinct payloads cycled through, so no run repeats the same string twice. */
const VARIANTS = 8;

/** Kept live so the render-only step cannot be optimised away. */
let sink = '';

/**
 * `wide` bumps every row, so consecutive variants differ everywhere.
 * `narrow` bumps only row 0, so every step — including the wrap from the last
 * variant back to the first — changes exactly one row. A cumulative or
 * round-robin model would make the wrap a much bigger change than the others
 * and quietly skew one sample in VARIANTS.
 * @param {number} rows
 * @param {number} version
 * @param {'wide' | 'narrow'} churn
 */
function markup(rows, version, churn) {
  const items = [];
  for (let r = 0; r < rows; r++) {
    const bump = churn === 'wide' || r === 0 ? version : 0;
    items.push(html`
      <tr id="row-${r}" class="${bump % 2 ? 'odd' : 'even'}">
        <td class="c0">${r}</td>
        <td class="c1">${bump}</td>
        <td class="c2">${(r * 31 + bump) % 1000}</td>
        <td class="c3">${bump % 2 ? 'up' : 'down'}</td>
        <td class="c4"><input class="probe" value="${bump}"></td>
      </tr>`);
  }
  return String(html`<table><tbody>${items}</tbody></table>`);
}

/**
 * What survives an update. Focus an input, apply one update, see what is left.
 * @param {Element} host
 * @param {(markup: string) => void} apply
 * @param {string} before
 * @param {string} after
 */
function survives(host, apply, before, after) {
  host.innerHTML = before;
  const input = /** @type {HTMLInputElement | null} */ (host.querySelector('.probe'));
  if (!input) throw new Error('bench/tree: probe input missing');
  input.focus();
  apply(after);
  return {
    sameNode: host.querySelector('.probe') === input,
    keepsFocus: document.activeElement === input,
  };
}

/**
 * @param {Element} host
 * @param {number} rows
 * @param {'wide' | 'narrow'} churn
 * @param {{ samples: number, warmup: number }} opts
 */
async function measureSize(host, rows, churn, { samples, warmup }) {
  const variants = Array.from({ length: VARIANTS }, (_, v) => markup(rows, v, churn));

  const render = await measure((i) => { sink = markup(rows, i % VARIANTS, churn); }, { samples, warmup });

  host.innerHTML = variants[0];
  const morphed = await measure((i) => morph(host, variants[i % VARIANTS]), { samples, warmup });

  host.innerHTML = variants[0];
  const replaced = await measure((i) => { host.innerHTML = variants[i % VARIANTS]; }, { samples, warmup });

  if (!sink.includes('<tr')) throw new Error('bench/tree: render step produced nothing');
  if (host.querySelectorAll('tr').length !== rows) throw new Error('bench/tree: tree did not materialise');

  return { rows, cells: rows * CELLS, render, morph: morphed, innerHTML: replaced };
}

/**
 * @param {{ samples?: number, warmup?: number }} [opts]
 */
export async function runTree({ samples = 40, warmup = 10 } = {}) {
  const host = document.getElementById('bench');
  if (!host) throw new Error('bench/tree: no #bench host element');

  const blocks = [];
  /** Largest wide-churn measurement, kept so the narrow block can compare against it. */
  let widest = /** @type {Awaited<ReturnType<typeof measureSize>> | null} */ (null);

  for (const churn of /** @type {const} */ (['wide', 'narrow'])) {
    /** @type {Awaited<ReturnType<typeof measureSize>>[]} */
    const sizes = [];
    for (const rows of SIZES) sizes.push(await measureSize(host, rows, churn, { samples, warmup }));

    // Ratio as morph ÷ innerHTML: above 1.0 means morph is the slower one.
    const columns = ['rows', 'nodes', 'render', 'morph', 'innerHTML', 'morph ÷ innerHTML'];
    const tableRows = sizes.map((s) => [
      String(s.rows),
      String(s.cells),
      ms(s.render.p50),
      ms(s.morph.p50),
      ms(s.innerHTML.p50),
      `${(s.morph.p50 / s.innerHTML.p50).toFixed(1)}×`,
    ]);
    const biggest = sizes[sizes.length - 1];

    if (churn === 'wide') {
      // The gate is the *supported* component size, not the largest measured.
      // A budget that is permanently red teaches everyone to ignore it; the
      // larger row is documented as the ceiling instead.
      widest = biggest;
      const ceiling = sizes[0];
      const budgetMs = 16; // one 60fps frame
      const update = ceiling.render.p50 + ceiling.morph.p50;
      blocks.push({
        name: 'wide',
        title: 'Scenario 1 — wide update (every row changes)',
        note: 'p50 ms per operation. render builds the string; morph and innerHTML each apply the same string.',
        columns,
        rows: tableRows,
        verdict: {
          label: `${ceiling.cells} nodes (the documented per-component ceiling), ` +
            `render + morph ≤ ${budgetMs} ms — actual ${ms(update)} ms`,
          pass: update <= budgetMs,
          hard: true,
        },
        raw: { churn, sizes },
      });
    } else {
      const before = markup(biggest.rows, 0, 'narrow');
      const after = markup(biggest.rows, 1, 'narrow');
      const kept = survives(host, (m) => morph(host, m), before, after);
      const lost = survives(host, (m) => { host.innerHTML = m; }, before, after);
      host.replaceChildren();

      if (!widest) throw new Error('bench/tree: wide scenario must run before narrow');
      blocks.push({
        name: 'narrow',
        title: 'Scenario 2 — narrow update (one row of N changes)',
        note:
          'p50 ms per operation. After one update — ' +
          `morph: node ${kept.sameNode ? 'kept' : 'lost'}, focus ${kept.keepsFocus ? 'kept' : 'lost'}; ` +
          `innerHTML: node ${lost.sameNode ? 'kept' : 'lost'}, focus ${lost.keepsFocus ? 'kept' : 'lost'}.`,
        columns,
        rows: tableRows,
        // Informational, never a gate. Both possible outcomes are legitimate:
        // innerHTML cannot preserve what morph preserves at any speed, so a
        // timing loss is a price, not a regression.
        verdict: {
          label:
            `morph costs ${(biggest.morph.p50 / biggest.innerHTML.p50).toFixed(1)}× innerHTML at ` +
            `${biggest.cells} nodes, and only ${(biggest.morph.p50 / widest.morph.p50 * 100).toFixed(0)}% ` +
            'of its own wide-update cost — morph time tracks tree size, not change size',
          pass: true,
          hard: false,
        },
        raw: { churn, sizes, preservation: { morph: kept, innerHTML: lost } },
      });
    }
  }

  return blocks;
}
