import { dev } from './dev.js';

/**
 * @typedef {(params: Record<string, string | undefined>, path: string) => void} RouteHandler
 */

// Navigation API + URLPattern globals (Baseline newly available 2026).
// Accessed as `any` until they land in lib.dom.d.ts.
const URLPatternImpl = /** @type {any} */ (globalThis).URLPattern;
const navigationImpl = /** @type {any} */ (globalThis).navigation;

/**
 * Client-side router built on the Navigation API and URLPattern (':param' and
 * '*' syntax). One `navigate` listener intercepts same-origin navigations —
 * link clicks, back/forward, and go(). Route changes are wrapped in a View
 * Transition when supported.
 */
export class Router {
  /** @type {{ pattern: any, handler: RouteHandler }[]} */
  #routes = [];
  /** @type {((path: string) => void) | null} */
  #notFound = null;

  /**
   * route('/blog/:slug/comments/:year', ({ slug, year }) => ...) — chainable.
   * @param {string} pattern
   * @param {RouteHandler} handler
   */
  route(pattern, handler) {
    this.#routes.push({ pattern: new URLPatternImpl({ pathname: pattern }), handler });
    return this;
  }

  /** @param {(path: string) => void} handler */
  notFound(handler) {
    this.#notFound = handler;
    return this;
  }

  /** Resolve the current URL, then intercept same-origin navigations. */
  start() {
    navigationImpl.addEventListener('navigate', (/** @type {any} */ event) => {
      if (!event.canIntercept || event.hashChange || event.downloadRequest !== null || event.formData) return;
      const apply = this.#match(new URL(event.destination.url).pathname);
      if (!apply) return; // no route, no notFound — let the browser navigate
      event.intercept({ handler: () => this.#transition(apply) });
    });
    const apply = this.#match(location.pathname);
    if (apply) this.#transition(apply);
    return this;
  }

  /**
   * @param {string} path
   * @param {{ replace?: boolean }} [options]
   */
  go(path, { replace = false } = {}) {
    if (path === location.pathname + location.search) return;
    navigationImpl.navigate(path, { history: replace ? 'replace' : 'push' });
  }

  /** @param {string} path @returns {(() => void) | null} thunk running the matched handler */
  #match(path) {
    for (const { pattern, handler } of this.#routes) {
      const match = pattern.exec({ pathname: path });
      if (!match) continue;
      const params = match.pathname.groups ?? {};
      dev.log('route', path, params);
      return () => handler(params, path);
    }
    dev.log('route (not found)', path);
    const notFound = this.#notFound;
    return notFound ? () => notFound(path) : null;
  }

  /** @param {() => void} apply */
  #transition(apply) {
    if (document.startViewTransition) document.startViewTransition(apply);
    else apply();
  }
}
