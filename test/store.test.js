import { test, expect } from 'bun:test';
import { Store } from '../src/store.js';

const tick = () => new Promise((resolve) => queueMicrotask(resolve));

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
