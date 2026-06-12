import { test, expect } from 'bun:test';
import { delegate } from '../src/delegate.js';

/** @param {string} html */
function mount(html) {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

const click = (/** @type {Element} */ el) => el.dispatchEvent(new Event('click', { bubbles: true }));

test('delegate fires for a matching descendant with the matched element', () => {
  const root = mount('<ul><li class="item"><button class="go">x</button></li></ul>');
  let matched = /** @type {Element | null} */ (null);
  delegate(root, 'click', '.item', (_event, el) => { matched = el; });
  click(/** @type {Element} */ (root.querySelector('.go')));
  expect(matched).toBe(root.querySelector('.item'));
  root.remove();
});

test('delegate ignores non-matching targets', () => {
  const root = mount('<a class="other">y</a>');
  let calls = 0;
  delegate(root, 'click', '.item', () => calls++);
  click(/** @type {Element} */ (root.querySelector('.other')));
  expect(calls).toBe(0);
  root.remove();
});

test('delegate listener is removed when opts.signal aborts', () => {
  const root = mount('<button class="go">x</button>');
  const ac = new AbortController();
  let calls = 0;
  delegate(root, 'click', '.go', () => calls++, { signal: ac.signal });
  click(/** @type {Element} */ (root.querySelector('.go')));
  expect(calls).toBe(1);
  ac.abort();
  click(/** @type {Element} */ (root.querySelector('.go')));
  expect(calls).toBe(1); // listener removed by the aborted signal
  root.remove();
});
