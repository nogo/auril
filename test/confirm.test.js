import { test, expect } from 'bun:test';
import { AurilElement, html } from '../src/index.js';
import { Confirm } from '../kit/confirm.js';

let deleted = 0;
class ConfirmHost extends AurilElement {
  confirm = new Confirm(() => this.update(), { sure: 'Sure?', ms: 20 });
  onConnect() {
    this.confirm.wire(this);
    this.delegate('click', '[data-confirm]', (_, el) => { if (this.confirm.tap(/** @type {HTMLElement} */ (el).dataset.confirm ?? '')) deleted++; });
  }
  render() {
    return html`${this.confirm.button('row-1', 'Delete row 1')}${this.confirm.button('row-2', 'Delete row 2')}`;
  }
}
customElements.define('confirm-host', ConfirmHost);

/** @returns {ConfirmHost} */
function mount() {
  deleted = 0;
  const el = /** @type {ConfirmHost} */ (document.createElement('confirm-host'));
  document.body.append(el);
  return el;
}
const button = (/** @type {Element} */ el, /** @type {string} */ id) => /** @type {HTMLButtonElement} */ (el.querySelector(`#${id}`));

test('the first tap arms, the second does the work', () => {
  const el = mount();
  button(el, 'row-1').click();
  expect(deleted).toBe(0);
  expect(button(el, 'row-1').textContent).toBe('Sure?');
  expect(button(el, 'row-1').getAttribute('aria-label')).toBe('Sure?');
  button(el, 'row-1').click();
  expect(deleted).toBe(1);
  expect(button(el, 'row-1').textContent).toBe('Delete row 1');
  el.remove();
});

test('arming another button disarms the first', () => {
  const el = mount();
  button(el, 'row-1').click();
  button(el, 'row-2').click();
  expect(button(el, 'row-1').textContent).toBe('Delete row 1');
  button(el, 'row-1').click();
  expect(deleted).toBe(0);
  el.remove();
});

test('Escape and the timeout fall back', async () => {
  const el = mount();
  button(el, 'row-1').click();
  button(el, 'row-1').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(el.confirm.armed('row-1')).toBe(false);
  button(el, 'row-1').click();
  await new Promise((r) => setTimeout(r, 40));
  expect(el.confirm.armed('row-1')).toBe(false);
  button(el, 'row-1').click();
  expect(deleted).toBe(0);
  el.remove();
});

test('disconnect clears an armed button and its timer', () => {
  const el = mount();
  button(el, 'row-1').click();
  el.remove();
  expect(el.confirm.armed('row-1')).toBe(false);
});
