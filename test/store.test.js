import { test, expect } from 'bun:test';
import { Store } from '../src/store.js';

const tick = () => new Promise((resolve) => queueMicrotask(resolve));

/** install a localStorage stub that overrides happy-dom's readonly global @param {any} stub */
const setLocalStorage = (stub) => Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true });

test('set merges a patch', () => {
  const s = new Store({ a: 1, b: 2 });
  s.set({ b: 3 });
  expect(s.state).toEqual({ a: 1, b: 3 });
});

test('functional updater receives current state', () => {
  const s = new Store({ n: 1 });
  s.set((state) => ({ n: state.n + 1 }));
  expect(s.state.n).toBe(2);
});

test('multiple set() calls notify once per microtask', async () => {
  const s = new Store({ n: 0 });
  let calls = 0;
  s.subscribe(() => calls++);
  s.set({ n: 1 });
  s.set({ n: 2 });
  s.set({ n: 3 });
  await tick();
  expect(calls).toBe(1);
  expect(s.state.n).toBe(3);
});

test('subscriber sees the final batched state', async () => {
  const s = new Store({ n: 0 });
  let seen;
  s.subscribe((state) => (seen = state.n));
  s.set({ n: 1 });
  s.set({ n: 2 });
  await tick();
  expect(seen).toBe(2);
});

test('unsubscribe stops notifications', async () => {
  const s = new Store({ n: 0 });
  let calls = 0;
  const unsub = s.subscribe(() => calls++);
  s.set({ n: 1 });
  await tick();
  unsub();
  s.set({ n: 2 });
  await tick();
  expect(calls).toBe(1);
});

test('persist writes once per microtask batch', async () => {
  let writes = 0;
  setLocalStorage({ getItem: () => null, setItem: () => { writes++; } });
  try {
    const s = new Store({ n: 0 }, { persist: ['n'], key: 'batch-test' });
    s.set({ n: 1 });
    s.set({ n: 2 });
    expect(writes).toBe(0);   // nothing written synchronously
    await tick();
    expect(writes).toBe(1);   // one write per batch
  } finally {
    delete (/** @type {any} */ (globalThis)).localStorage;
  }
});

test('a throwing subscriber does not block later subscribers', async () => {
  const s = new Store({ n: 0 });
  let reached = 0;
  s.subscribe(() => { throw new Error('boom'); });
  s.subscribe(() => { reached++; });
  const orig = console.error;
  console.error = () => {}; // the thrown error is logged, not rethrown
  try {
    s.set({ n: 1 });
    await tick();
  } finally {
    console.error = orig;
  }
  expect(reached).toBe(1);
});

/** map-backed localStorage stub @param {Record<string, string>} [initial] */
function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return /** @type {any} */ ({
    getItem: (/** @type {string} */ k) => (map.has(k) ? map.get(k) : null),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => { map.set(k, v); },
    removeItem: (/** @type {string} */ k) => { map.delete(k); },
  });
}

test('versioned hydrate applies saved data when version matches', () => {
  setLocalStorage(memStorage({ 'v-test': JSON.stringify({ v: 2, data: { n: 7 } }) }));
  try {
    const s = new Store({ n: 0 }, { persist: ['n'], key: 'v-test', version: 2 });
    expect(s.state.n).toBe(7);
  } finally {
    delete (/** @type {any} */ (globalThis)).localStorage;
  }
});

test('versioned hydrate discards saved data on version mismatch', () => {
  setLocalStorage(memStorage({ 'v-test': JSON.stringify({ v: 1, data: { n: 7 } }) }));
  try {
    const s = new Store({ n: 0 }, { persist: ['n'], key: 'v-test', version: 2 });
    expect(s.state.n).toBe(0); // stale data discarded, defaults win
  } finally {
    delete (/** @type {any} */ (globalThis)).localStorage;
  }
});

test('versioned persist writes an envelope payload', async () => {
  const ls = memStorage();
  setLocalStorage(ls);
  try {
    const s = new Store({ n: 0 }, { persist: ['n'], key: 'env-test', version: 3 });
    s.set({ n: 5 });
    await tick();
    expect(JSON.parse(ls.getItem('env-test'))).toEqual({ v: 3, data: { n: 5 } });
  } finally {
    delete (/** @type {any} */ (globalThis)).localStorage;
  }
});

test('unversioned persist writes a flat payload', async () => {
  const ls = memStorage();
  setLocalStorage(ls);
  try {
    const s = new Store({ n: 0 }, { persist: ['n'], key: 'flat-test' });
    s.set({ n: 5 });
    await tick();
    expect(JSON.parse(ls.getItem('flat-test'))).toEqual({ n: 5 });
  } finally {
    delete (/** @type {any} */ (globalThis)).localStorage;
  }
});

/** @param {string} key @param {unknown} payload */
const fireStorage = (key, payload) =>
  globalThis.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(payload) }));

test('cross-tab sync applies changed persisted keys and leaves the rest alone', async () => {
  setLocalStorage(memStorage());
  const s = new Store({ n: 0, local: 'x' }, { persist: ['n'], key: 'tab-test' });
  try {
    let calls = 0;
    s.subscribe(() => calls++);
    fireStorage('tab-test', { n: 9 });
    await tick();
    expect(s.state.n).toBe(9);
    expect(s.state.local).toBe('x'); // non-persisted key untouched
    expect(calls).toBe(1);
  } finally {
    s.destroy();
    delete (/** @type {any} */ (globalThis)).localStorage;
  }
});

test('cross-tab sync ignores a payload equal to current state', async () => {
  setLocalStorage(memStorage());
  const s = new Store({ todos: [{ id: 1 }] }, { persist: ['todos'], key: 'echo-test' });
  try {
    let calls = 0;
    s.subscribe(() => calls++);
    // Deep-equal but freshly parsed: a reference check would patch here, write
    // back to storage, and bounce the change to the tab that sent it.
    fireStorage('echo-test', { todos: [{ id: 1 }] });
    await tick();
    expect(calls).toBe(0);
  } finally {
    s.destroy();
    delete (/** @type {any} */ (globalThis)).localStorage;
  }
});

test('destroy() detaches the cross-tab listener', async () => {
  setLocalStorage(memStorage());
  const s = new Store({ n: 0 }, { persist: ['n'], key: 'destroy-test' });
  try {
    s.destroy();
    fireStorage('destroy-test', { n: 5 });
    await tick();
    expect(s.state.n).toBe(0);
  } finally {
    delete (/** @type {any} */ (globalThis)).localStorage;
  }
});
