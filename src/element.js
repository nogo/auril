import { morph } from './morph.js';

/**
 * Optional hooks a subclass may define.
 * @typedef {object} Hooks
 * @property {() => void} [onConnect]    invoked on connect; attach listeners/watches here
 * @property {() => void} [onDisconnect] invoked on disconnect, after auto-cleanup
 * @property {() => unknown} [render]    if defined, update() morphs the DOM to its result
 */

export class AurilElement extends HTMLElement {
  /**
   * Shared app store — assign once at startup: AurilElement.store = new Store({...})
   * @type {import('./store.js').Store<any> | null}
   */
  static store = null;

  /** @type {AbortController | undefined} */
  _ac;
  /** @type {AbortSignal | undefined} */
  signal;

  connectedCallback() {
    this._ac = new AbortController();
    this.signal = this._ac.signal;
    const self = /** @type {AurilElement & Hooks} */ (this);
    self.onConnect?.();
    if (self.render) this.update();
  }

  disconnectedCallback() {
    this._ac?.abort();
    /** @type {AurilElement & Hooks} */ (this).onDisconnect?.();
  }

  /**
   * addEventListener that is removed automatically on disconnect.
   * @param {EventTarget} target
   * @param {string} type
   * @param {EventListenerOrEventListenerObject} handler
   * @param {AddEventListenerOptions} [opts]
   */
  on(target, type, handler, opts = {}) {
    target.addEventListener(type, handler, { ...opts, signal: this.signal });
  }

  /**
   * watch()              — re-render (update()) on any store change
   * watch(cb)            — cb(state) on any store change
   * watch(selector, cb)  — cb(slice, state) only when the selected slice changes
   * Subscriptions are removed automatically on disconnect.
   * @param {(state: any) => any} [selectorOrCb]
   * @param {(slice: any, state: any) => void} [maybeCb]
   */
  watch(selectorOrCb, maybeCb) {
    const store = /** @type {typeof AurilElement} */ (this.constructor).store;
    if (!store) throw new Error(`[auril] <${this.localName}>: assign AurilElement.store before calling watch()`);
    const selector = typeof maybeCb === 'function' ? selectorOrCb : null;
    const cb = (selector ? maybeCb : selectorOrCb) ?? (() => this.update());
    let prev = selector ? selector(store.state) : undefined;
    const unsub = store.subscribe((state) => {
      if (!selector) return cb(state, state);
      const next = selector(state);
      if (next === prev) return;
      prev = next;
      cb(next, state);
    });
    this.signal?.addEventListener('abort', unsub, { once: true });
  }

  /** Morph the live DOM to match render(). Preserves focus, selection, scroll. */
  update() {
    const self = /** @type {AurilElement & Hooks} */ (this);
    if (!self.render) return;
    try {
      morph(this, self.render());
    } catch (err) {
      console.error(`[auril] render failed in <${this.localName}>`, err);
      throw err;
    }
  }
}
