/** Dev mode: add ?auril-dev to the URL, or set dev.enabled = true at startup. */
export const dev = {
  enabled: typeof location !== 'undefined' && new URLSearchParams(location.search).has('auril-dev'),
  /** @param {...unknown} args */
  log(...args) {
    if (this.enabled) console.debug('[auril]', ...args);
  },
};
