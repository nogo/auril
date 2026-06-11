import { dev } from './dev.js';

/**
 * @typedef {(params: Record<string, string | undefined>, path: string) => void} RouteHandler
 * @typedef {{ exec(input: { pathname: string }): { pathname: { groups: Record<string, string | undefined> } } | null }} Matcher
 */

const URLPatternImpl = /** @type {any} */ (globalThis).URLPattern;

/** @param {string} pathname @returns {Matcher} */
function compile(pathname) {
  if (URLPatternImpl) return new URLPatternImpl({ pathname });
  // Fallback for engines without URLPattern: ':name' params and '*' wildcards.
  /** @type {string[]} */
  const names = [];
  const source = pathname
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)/g, (_, name) => (names.push(name), '([^/]+)'))
    .replace(/\*/g, '.*');
  const re = new RegExp(`^${source}$`);
  return {
    exec({ pathname: path }) {
      const match = re.exec(path);
      if (!match) return null;
      /** @type {Record<string, string | undefined>} */
      const groups = {};
      names.forEach((name, i) => (groups[name] = match[i + 1]));
      return { pathname: { groups } };
    },
  };
}

export class Router {
  /** @type {{ pattern: Matcher, handler: RouteHandler }[]} */
  #routes = [];
  /** @type {((path: string) => void) | null} */
  #notFound = null;

  /**
   * route('/blog/:slug/comments/:year', ({ slug, year }) => ...) — chainable.
   * @param {string} pattern
   * @param {RouteHandler} handler
   */
  route(pattern, handler) {
    this.#routes.push({ pattern: compile(pattern), handler });
    return this;
  }

  /** @param {(path: string) => void} handler */
  notFound(handler) {
    this.#notFound = handler;
    return this;
  }

  /**
   * Resolve the current URL, then handle popstate and same-origin link clicks.
   * @param {{ links?: boolean }} [options]
   */
  start({ links = true } = {}) {
    window.addEventListener('popstate', () => this.#resolve());
    if (links) document.addEventListener('click', (event) => this.#onClick(event));
    this.#resolve();
    return this;
  }

  /**
   * @param {string} path
   * @param {{ replace?: boolean }} [options]
   */
  go(path, { replace = false } = {}) {
    if (path === location.pathname + location.search) return;
    if (replace) history.replaceState({}, '', path);
    else history.pushState({}, '', path);
    this.#resolve();
  }

  /** @param {MouseEvent} event */
  #onClick(event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element
      ? /** @type {HTMLAnchorElement | null} */ (event.target.closest('a[href]'))
      : null;
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
    if (anchor.origin !== location.origin) return;
    event.preventDefault();
    this.go(anchor.pathname + anchor.search);
  }

  #resolve() {
    const path = location.pathname;
    for (const { pattern, handler } of this.#routes) {
      const match = pattern.exec({ pathname: path });
      if (!match) continue;
      const params = match.pathname.groups ?? {};
      dev.log('route', path, params);
      return this.#transition(() => handler(params, path));
    }
    dev.log('route (not found)', path);
    if (this.#notFound) {
      const handler = this.#notFound;
      this.#transition(() => handler(path));
    }
  }

  /** @param {() => void} apply */
  #transition(apply) {
    if (document.startViewTransition) document.startViewTransition(apply);
    else apply();
  }
}
