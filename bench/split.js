// Scenario 4 — where morph's time actually goes: parse or walk?
//
// Scenarios 1 and 2 established that morph costs 5–7× `innerHTML` and that its
// cost tracks tree size rather than change size. Neither could say whether that
// is the HTML *parse* or the tree *walk*, and the answer decides something
// concrete: if the parse dominates, handing morph pre-parsed content — what a
// parts-based renderer or a template-caching Idiomorph would do — recovers most
// of the cost. If the walk dominates, none of it is recoverable and the
// per-component node ceiling is the whole answer.
//
// The separation is exact, not inferred. Idiomorph accepts a Node as well as a
// string, and the Node path skips parseContent() entirely, so:
//
//     parse = morph(string) − morph(nodes)
//
// Two things this has to get right to be honest:
//
//  1. Idiomorph *consumes* the content it is given (it moves nodes into the
//     target), so the pre-parsed path needs a fresh clone per run. The clone is
//     excluded from the timing — see measureEach in lib.js.
//  2. `src/morph.js` calls `String(content)`, so auril's public morph() is
//     string-only by construction and cannot reach the Node path at all. This
//     file therefore calls Idiomorph directly, with the same config morph.js
//     passes, so the string column reproduces production cost exactly and the
//     node column shows what is *available* if morph.js changed — not something
//     that can be switched on today.
//
// The last column is the floor: `template.innerHTML = str` is the cheapest
// possible parse of the same string. Comparing it against (string − nodes) says
// whether Idiomorph's parse is near-optimal or carries overhead — it uses
// DOMParser plus a whole-string SVG-stripping regex and a string concatenation,
// not a template assignment.

import { Idiomorph } from '../src/vendor/idiomorph.js';
import { measureEach, ms } from './lib.js';
import { markup, SIZES, VARIANTS } from './tree.js';

/** Exactly what src/morph.js passes, so the string column is production cost. */
const OPTIONS = /** @type {const} */ ({ morphStyle: 'innerHTML', ignoreActiveValue: true });

/**
 * Measured under **wide** churn, matching scenario 1 so the string column is
 * directly comparable. Parse cost is independent of churn while walk cost is
 * not, so the parse share reported here is a *lower bound* — under narrow churn
 * the same parse is a larger fraction of a smaller total.
 * @param {{ samples?: number, warmup?: number }} [opts]
 */
export async function runSplit({ samples = 30, warmup = 8 } = {}) {
  const host = document.getElementById('bench');
  if (!host) throw new Error('bench/split: no #bench host element');
  const scratch = document.createElement('template');

  const sizes = [];
  for (const rows of SIZES) {
    const variants = Array.from({ length: VARIANTS }, (_, v) => markup(rows, v, 'wide'));
    const templates = variants.map((source) => {
      const template = document.createElement('template');
      template.innerHTML = source;
      return template;
    });

    host.innerHTML = variants[0];
    const fromString = await measureEach(
      (i) => variants[i % VARIANTS],
      (source) => Idiomorph.morph(host, source, OPTIONS),
      { samples, warmup },
    );

    host.innerHTML = variants[0];
    const fromNodes = await measureEach(
      (i) => templates[i % VARIANTS].content.cloneNode(true),
      (node) => Idiomorph.morph(host, node, OPTIONS),
      { samples, warmup },
    );

    const parseFloor = await measureEach(
      (i) => variants[i % VARIANTS],
      (source) => { scratch.innerHTML = source; },
      { samples, warmup },
    );

    if (host.querySelectorAll('tr').length !== rows) throw new Error('bench/split: tree did not materialise');

    sizes.push({
      rows,
      bytes: variants[0].length,
      fromString,
      fromNodes,
      parseFloor,
      parseMs: fromString.p50 - fromNodes.p50,
      parseShare: (fromString.p50 - fromNodes.p50) / fromString.p50,
    });
  }

  host.replaceChildren();
  const biggest = sizes[sizes.length - 1];

  return {
    name: 'split',
    title: "Scenario 4 — where morph's time goes (parse vs walk, wide churn)",
    note:
      'p50 ms per operation, via Idiomorph directly. "from nodes" is the same morph ' +
      'handed a pre-parsed tree (clone excluded); parse = string − nodes. ' +
      '"template floor" is the cheapest possible parse of the same string.',
    columns: ['nodes', 'string bytes', 'from string', 'from nodes', 'parse', 'parse share', 'template floor'],
    rows: sizes.map((s) => [
      String(s.rows * 5),
      String(s.bytes),
      ms(s.fromString.p50),
      ms(s.fromNodes.p50),
      ms(s.parseMs),
      `${(s.parseShare * 100).toFixed(0)}%`,
      ms(s.parseFloor.p50),
    ]),
    verdict: {
      label:
        `at ${biggest.rows * 5} nodes the parse is ${(biggest.parseShare * 100).toFixed(0)}% of morph ` +
        `(${ms(biggest.parseMs)} ms of ${ms(biggest.fromString.p50)} ms); ` +
        `the walk is the other ${(100 - biggest.parseShare * 100).toFixed(0)}%`,
      pass: true,
      hard: false,
    },
    raw: { churn: 'wide', options: OPTIONS, sizes },
  };
}
