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
  /** @type {number | undefined} */
  #version;
  #pending = false;

  /**
   * @param {S} defaults
   * @param {{ persist?: string[], key?: string, version?: number }} [options] persist: keys mirrored to localStorage; version: bump to discard incompatible saved data
   */
  constructor(defaults, { persist = [], key = 'auril-store', version } = {}) {
    this.#persistKeys = persist;
    this.#storageKey = key;
    this.#version = version;
    this.#state = this.#hydrate(defaults);
    if (dev.enabled) (/** @type {any} */ (globalThis).__auril ??= {})[key] = this;
    if (persist.length) globalThis.addEventListener?.('storage', (event) => this.#syncFromStorage(event));
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
    if (this.#pending) return;
    this.#pending = true;
    queueMicrotask(() => {
      this.#pending = false;
      this.#persist();
      for (const fn of [...this.#subs]) {
        try { fn(this.#state); } catch (err) { console.error('[auril] subscriber failed', err); }
      }
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
      const data = this.#readPersisted(localStorage.getItem(this.#storageKey));
      for (const key of this.#persistKeys) {
        if (data?.[key] !== undefined) state[/** @type {keyof S} */ (key)] = data[key];
      }
    } catch { /* no storage (tests) or corrupt data — keep defaults */ }
    return state;
  }

  /**
   * Parse a raw localStorage payload into the persisted-keys object, applying
   * the version check when versioning is enabled. Returns null when absent or
   * version-mismatched (stale data discarded; migrations stay app code).
   * @param {string | null} raw
   * @returns {Record<string, any> | null}
   */
  #readPersisted(raw) {
    const saved = JSON.parse(raw ?? 'null');
    if (this.#version === undefined) return saved ?? null;
    return saved?.v === this.#version ? (saved.data ?? null) : null;
  }

  #persist() {
    if (!this.#persistKeys.length) return;
    try {
      /** @type {Record<string, unknown>} */
      const data = {};
      for (const key of this.#persistKeys) data[key] = this.#state[key];
      const payload = this.#version === undefined ? data : { v: this.#version, data };
      localStorage.setItem(this.#storageKey, JSON.stringify(payload));
    } catch { /* no storage or quota exceeded — state stays in memory */ }
  }

  /**
   * Mirror a cross-tab localStorage write into this store. The `storage` event
   * fires only in *other* tabs, so there is no echo loop; last write wins and
   * non-persisted keys are untouched. Corrupt payloads keep current state.
   * @param {StorageEvent} event
   */
  #syncFromStorage(event) {
    if (event.key !== this.#storageKey) return;
    try {
      const data = this.#readPersisted(event.newValue);
      if (!data) return;
      /** @type {Partial<S>} */
      const patch = {};
      let changed = false;
      for (const key of this.#persistKeys) {
        if (data[key] !== undefined) { patch[/** @type {keyof S} */ (key)] = data[key]; changed = true; }
      }
      if (changed) this.set(patch);
    } catch { /* corrupt cross-tab payload — keep current state */ }
  }
}
