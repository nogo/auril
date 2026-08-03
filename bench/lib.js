// Shared measurement plumbing for the auril.js benches.
//
// Every scenario returns the same block shape so the runner and the standalone
// page can print it without knowing anything about the scenario:
//
//   { name, title, note, columns: string[], rows: string[][], verdict?, raw }
//
// A `verdict` with `hard: true` fails the process; `hard: false` is reported but
// does not, because some comparisons have legitimate outcomes in both
// directions.

/**
 * @param {number[]} samples
 * @returns {{ p50: number, p95: number, mean: number, n: number }}
 */
export function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (/** @type {number} */ p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  return {
    p50: at(50),
    p95: at(95),
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    n: sorted.length,
  };
}

/**
 * Pick a batch size that puts one timed sample well above the clock's floor.
 *
 * Chrome clamps performance.now() to 100µs unless the page is cross-origin
 * isolated, so anything cheaper than that is unmeasurable alone — timing single
 * operations yields a column of 0.0s. Calibrating instead of hardcoding keeps
 * cheap scenarios (a 5µs store patch) and expensive ones (a 15ms morph over
 * 1000 nodes) both honest, and keeps total runtime bounded either way.
 * @param {(i: number) => unknown} step
 * @param {{ targetMs?: number }} [opts]
 */
export async function calibrate(step, { targetMs = 2 } = {}) {
  const warm = step(0);
  if (warm instanceof Promise) await warm;
  const started = performance.now();
  const once = step(1);
  if (once instanceof Promise) await once;
  const elapsed = performance.now() - started;
  // `elapsed` may read 0 thanks to the clamp; 0.05ms is half the clamp, i.e. the
  // most optimistic cost consistent with the reading.
  return Math.max(1, Math.min(500, Math.ceil(targetMs / Math.max(elapsed, 0.05))));
}

/**
 * Time `samples` batches of `batch` operations; return per-operation ms.
 * Only awaits when a step is actually async — an unconditional await would add
 * a microtask turn to every synchronous operation being measured.
 * @param {(i: number) => unknown} step
 * @param {{ samples: number, warmup: number, batch: number }} opts
 * @returns {Promise<number[]>}
 */
export async function timeBatched(step, { samples, warmup, batch }) {
  /** @type {number[]} */
  const out = [];
  let n = 0;
  for (let sample = 0; sample < warmup + samples; sample++) {
    const started = performance.now();
    for (let k = 0; k < batch; k++) {
      const result = step(n++);
      if (result instanceof Promise) await result;
    }
    const elapsed = performance.now() - started;
    if (sample >= warmup) out.push(elapsed / batch);
  }
  return out;
}

/**
 * Calibrate then measure, in one call.
 * @param {(i: number) => unknown} step
 * @param {{ samples: number, warmup: number, targetMs?: number }} opts
 */
export async function measure(step, { samples, warmup, targetMs }) {
  const batch = await calibrate(step, { targetMs });
  const result = stats(await timeBatched(step, { samples, warmup, batch }));
  return { ...result, batch };
}

/** @param {number} ms */
export const ms = (ms) => ms.toFixed(3);
