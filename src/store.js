import { dev } from './dev.js';

/**
 * Observable state container. Notifications are batched per microtask.
 * The state shape S is inferred from the defaults you pass.
 * @template {Record<string, any>} S
 */
export class Store {
  /** @type {S} */
  #state;
  /** @type {Set<(state: S) => void>} */
  #subs = new Set();
  /** @type {string[]} */
  #persistKeys;
  /** @type {string} */
  #storageKey;
  #pending = false;

  /**
   * @param {S} defaults
   * @param {{ persist?: string[], key?: string }} [options] persist: state keys mirrored to localStorage
   */
  constructor(defaults, { persist = [], key = 'auril-store' } = {}) {
    this.#persistKeys = persist;
    this.#storageKey = key;
    this.#state = this.#hydrate(defaults);
  }

  get state() {
    return this.#state;
  }

  /**
   * Patch state: set({k: v}) or set(state => patch). Subscribers notified once per microtask.
   * @param {Partial<S> | ((state: S) => Partial<S>)} updater
   */
  set(updater) {
    const patch = typeof updater === 'function' ? updater(this.#state) : updater;
    this.#state = /** @type {S} */ ({ ...this.#state, ...patch });
    dev.log('store.set', patch);
    this.#persist();
    if (this.#pending) return;
    this.#pending = true;
    queueMicrotask(() => {
      this.#pending = false;
      for (const fn of [...this.#subs]) fn(this.#state);
    });
  }

  /**
   * @param {(state: S) => void} fn
   * @returns {() => void} unsubscribe
   */
  subscribe(fn) {
    this.#subs.add(fn);
    return () => {
      this.#subs.delete(fn);
    };
  }

  /** @param {S} defaults @returns {S} */
  #hydrate(defaults) {
    const state = { ...defaults };
    try {
      const saved = JSON.parse(localStorage.getItem(this.#storageKey) ?? 'null');
      for (const key of this.#persistKeys) {
        if (saved?.[key] !== undefined) state[/** @type {keyof S} */ (key)] = saved[key];
      }
    } catch { /* no storage (tests) or corrupt data — keep defaults */ }
    return state;
  }

  #persist() {
    if (!this.#persistKeys.length) return;
    try {
      /** @type {Record<string, unknown>} */
      const data = {};
      for (const key of this.#persistKeys) data[key] = this.#state[key];
      localStorage.setItem(this.#storageKey, JSON.stringify(data));
    } catch { /* no storage or quota exceeded — state stays in memory */ }
  }
}
