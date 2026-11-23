// Two-tap confirm for a destructive button: the first tap turns the button
// into "Sure?" in place, the second does the work. It falls back after three
// seconds, on Escape, and when focus leaves the button. No dialog.
//
// One Confirm per component; it arms one button at a time, named by a key.
//
//   #confirm = new Confirm(() => this.update(), { sure: 'Sicher?' });
//   onConnect() {
//     this.#confirm.wire(this);
//     this.delegate('click', '[data-confirm]', (_, el) => {
//       if (this.#confirm.tap(el.dataset.confirm)) this.#delete(el.dataset.confirm);
//     });
//   }
//   render() { return html`${this.#confirm.button('tx-42', 'Delete transaction')}`; }
import { html } from '../src/index.js';

export class Confirm {
  /** @type {string | null} */
  #key = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #timer;
  #changed;
  #sure;
  #ms;

  /**
   * @param {() => void} changed runs when a button arms or falls back; pass the component's update.
   * @param {{ sure?: string, ms?: number }} [opts] the armed button's text, and how long it stays armed.
   */
  constructor(changed, { sure = 'Sure?', ms = 3000 } = {}) {
    this.#changed = changed;
    this.#sure = sure;
    this.#ms = ms;
  }

  /**
   * Arms key, or answers true when key was already armed: then do the work.
   * @param {string} key
   */
  tap(key) {
    if (this.#key === key) {
      this.reset();
      return true;
    }
    clearTimeout(this.#timer);
    this.#key = key;
    this.#timer = setTimeout(() => this.reset(), this.#ms);
    this.#changed();
    return false;
  }

  /** Disarms the armed button, if any. */
  reset() {
    if (this.#key === null) return;
    clearTimeout(this.#timer);
    this.#key = null;
    this.#changed();
  }

  /**
   * Makes Escape and leaving focus disarm inside el. Call from onConnect().
   * @param {import('../src/index.js').AurilElement} el
   */
  wire(el) {
    el.delegate('keydown', '[data-confirm]', (e) => { if (/** @type {KeyboardEvent} */ (e).key === 'Escape') this.reset(); });
    el.delegate('focusout', '[data-confirm]', () => this.reset());
    // A timer left running after disconnect would call update() on a detached element.
    el.signal?.addEventListener('abort', () => { clearTimeout(this.#timer); this.#key = null; });
  }

  /**
   * Whether key waits for its second tap, for a component that draws its own button.
   * @param {string} key
   */
  armed(key) {
    return this.#key === key;
  }

  /**
   * The button for key. label names what it deletes; content is what the
   * unarmed button shows (an icon, say) and defaults to label.
   * @param {string} key
   * @param {string} label
   * @param {unknown} [content]
   */
  button(key, label, content = label) {
    const armed = this.#key === key;
    return html`<button type="button" id="${key}" class="button danger${armed ? ' armed' : ''}" data-confirm="${key}" aria-label="${armed ? this.#sure : label}">${armed ? this.#sure : content}</button>`;
  }
}
