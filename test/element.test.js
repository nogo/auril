import { test, expect } from 'bun:test';
import { AurilElement } from '../src/element.js';
import { Store } from '../src/store.js';

const tick = () => new Promise((resolve) => queueMicrotask(resolve));

let uid = 0;
/** Define a one-off AurilElement subclass with the given prototype methods. @param {Record<string, any>} [proto] */
function create(proto = {}) {
  class El extends AurilElement {}
  Object.assign(El.prototype, proto);
  const tag = `auril-test-${uid++}`;
  customElements.define(tag, El);
  return /** @type {any} */ (document.createElement(tag));
}

test('on() listener is removed on disconnect', () => {
  let count = 0;
  const el = create({ onConnect() { this.on(this, 'ping', () => count++); } });
  document.body.append(el);
  el.dispatchEvent(new Event('ping'));
  expect(count).toBe(1);
  el.remove();
  el.dispatchEvent(new Event('ping'));
  expect(count).toBe(1); // listener died with the element
});

test('watch(selector, cb) fires only on slice change and unsubscribes on disconnect', async () => {
  const store = new Store({ a: 1, b: 1 });
  AurilElement.store = store;
  /** @type {number[]} */
  const seen = [];
  const el = create({ onConnect() { this.watch((/** @type {any} */ s) => s.a, (/** @type {number} */ a) => seen.push(a)); } });
  document.body.append(el);

  store.set({ b: 2 }); // unrelated slice
  await tick();
  expect(seen).toEqual([]); // a unchanged → no call

  store.set({ a: 2 });
  await tick();
  expect(seen).toEqual([2]);

  el.remove();
  store.set({ a: 3 });
  await tick();
  expect(seen).toEqual([2]); // unsubscribed on disconnect
});

test('on(), delegate(), and watch() throw before connect', () => {
  AurilElement.store = new Store({ x: 1 });
  const el = create();
  expect(() => el.on(el, 'click', () => {})).toThrow(/before connect/);
  expect(() => el.delegate('click', 'a', () => {})).toThrow(/before connect/);
  expect(() => el.watch()).toThrow(/before connect/);
});

test('on(), delegate(), and watch() throw after disconnect', () => {
  AurilElement.store = new Store({ x: 1 });
  const el = create();
  document.body.append(el);
  el.remove();
  // The signal survives disconnect in aborted form, and addEventListener with an
  // aborted signal is a silent no-op — so these must throw rather than no-op.
  expect(() => el.on(el, 'click', () => {})).toThrow(/after disconnect/);
  expect(() => el.delegate('click', 'a', () => {})).toThrow(/after disconnect/);
  expect(() => el.watch()).toThrow(/after disconnect/);
});

test('a failing render() is reported once per path, never rethrown', () => {
  const el = create({ render() { throw new Error('boom'); } });
  const orig = globalThis.reportError;
  /** @type {any[]} */
  const reported = [];
  globalThis.reportError = (/** @type {any} */ err) => { reported.push(err); };
  try {
    document.body.append(el); // connect path: must not escape connectedCallback
    el.update();              // store-driven path: same behaviour
  } finally {
    globalThis.reportError = orig;
  }
  expect(reported.length).toBe(2);
  expect(reported[0].message).toMatch(/render failed in <auril-test-/);
  expect(reported[0].cause.message).toBe('boom');
  el.remove();
});

test('update() morphs render() output into the element', () => {
  const el = create({ render() { return '<p class="x">hi</p>'; } });
  document.body.append(el); // connectedCallback runs update() because render is defined
  expect(el.querySelector('p.x')?.textContent).toBe('hi');

  el.render = () => '<p class="x">bye</p>';
  el.update();
  expect(el.querySelector('p.x')?.textContent).toBe('bye');
});

test('update() skips the morph when render() output is unchanged', () => {
  const el = create({ render() { return '<p class="x">hi</p>'; } });
  document.body.append(el);

  // Out-of-band DOM mutation as a probe: a skipped morph leaves it in place.
  el.querySelector('p.x').textContent = 'mutated';
  el.update(); // same render output → skipped
  expect(el.querySelector('p.x')?.textContent).toBe('mutated');

  el.render = () => '<p class="x">changed</p>';
  el.update(); // output differs → real morph
  expect(el.querySelector('p.x')?.textContent).toBe('changed');
});

test('update() morphs fresh after reconnect', () => {
  const el = create({ render() { return '<p class="x">hi</p>'; } });
  document.body.append(el);
  el.remove();
  el.querySelector('p.x').textContent = 'mutated while detached';
  document.body.append(el); // connect runs update(); memo must not skip
  expect(el.querySelector('p.x')?.textContent).toBe('hi');
});
