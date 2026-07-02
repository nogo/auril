// Per-app API seam (convention: components never fetch directly, they call
// api.js). This one fakes a server with latency so the demo works offline;
// swap the internals for real fetch() calls without touching components.

const TEAM = [
  { name: 'Ada Lovelace', role: 'Analyst' },
  { name: 'Grace Hopper', role: 'Compiler engineer' },
  { name: 'Katherine Johnson', role: 'Navigator' },
  { name: 'Margaret Hamilton', role: 'Flight software lead' },
  { name: 'Barbara Liskov', role: 'Abstraction architect' },
  { name: 'Radia Perlman', role: 'Network designer' },
  { name: 'Frances Allen', role: 'Optimizer' },
  { name: 'Lynn Conway', role: 'Chip designer' },
];

/**
 * Search team members. Rejects with AbortError when the signal fires,
 * like real fetch(). Query "fail" simulates a server error.
 * @param {string} query
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ name: string, role: string }[]>}
 */
export async function searchTeam(query, { signal } = {}) {
  await sleep(600, signal);
  if (query.trim() === 'fail') throw new Error('500 — simulated server error');
  const q = query.trim().toLowerCase();
  return TEAM.filter((m) => (m.name + ' ' + m.role).toLowerCase().includes(q));
}

/** @param {number} ms @param {AbortSignal} [signal] */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}
