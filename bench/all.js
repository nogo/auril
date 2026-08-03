// Every scenario, in order, as a flat list of printable blocks.
// Both consumers — bench/run.js (Playwright) and bench/index.html (standalone) —
// go through here, so adding a scenario means touching one file.

import { runTree } from './tree.js';
import { runFanout } from './fanout.js';

/**
 * @param {{ samples?: number, warmup?: number }} [opts]
 */
export async function runAll({ samples = 40, warmup = 10 } = {}) {
  const blocks = [];
  blocks.push(...(await runTree({ samples, warmup })));
  blocks.push(await runFanout({ samples, warmup }));
  return { samples, warmup, userAgent: navigator.userAgent, blocks };
}
