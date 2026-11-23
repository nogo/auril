import { dev } from './dev.js';

/**
 * Handlers receive the matched `:params` and the destination `URL`. Routes match
 * on `url.pathname` only — read `url.searchParams` for query state. A handler may
 * return a promise; the navigation finishes once it settles.
 * @typedef {(params: Record<string, string | undefined>, url: URL) => unknown} RouteHandler
 */

// Navigation API + URLPattern globals (Baseline newly available 2026).
// Accessed as `any` until they land in lib.dom.d.ts.
const URLPatternImpl = /** @type {any} */ (globalThis).URLPattern;
const navigationImpl = /** @type {any} */ (globalThis).navigation;

/**
 * Client-side router built on the Navigation API and URLPattern (':param' and
 * '*' syntax). One `navigate` listener intercepts same-origin navigations —
 * link clicks, back/forward, and go(); a reload is left to the browser.
 * The navigation finishes when the handler's returned promise settles, so the
 * browser restores scroll and resets focus against the new DOM.
 */
export class Router {
  /** @type {{ pattern: any, handler: RouteHandler }[]} */
  #routes = [];
  /** @type {((url: URL) => void) | null} */
  #notFound = null;
  #started = false;

  /**
   * route('/blog/:slug/comments/:year', ({ slug, year }) => ...) — chainable.
   * @param {string} pattern
   * @param {RouteHandler} handler
   */
  route(pattern, handler) {
    this.#routes.push({ pattern: new URLPatternImpl({ pathname: pattern }), handler });
    return this;
  }

  /** @param {(url: URL) => void} handler */
  notFound(handler) {
    this.#notFound = handler;
    return this;
  }

  /** Resolve the current URL, then intercept same-origin navigations. */
  start() {
    if (this.#started) throw new Error('[auril] Router.start() called twice — one Router per app');
    this.#started = true;
    navigationImpl.addEventListener('navigate', (/** @type {any} */ event) => {
      // `formData` is non-null for POST submissions only — GET form submissions
      // are ordinary same-origin navigations and stay routed (the handler reads
      // the query off the URL it is given).
      // A reload stays the browser's: intercepted, location.reload() after a
      // service-worker update would re-run the route on the old code.
      if (!event.canIntercept || event.hashChange || event.downloadRequest !== null || event.formData) return;
      if (event.navigationType === 'reload') return;
      const apply = this.#match(new URL(event.destination.url));
      if (!apply) return; // no route, no notFound — let the browser navigate
      event.intercept({ handler: async () => { await apply(); } });
    });
    this.#match(new URL(location.href))?.();
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

  /** @param {URL} url @returns {(() => unknown) | null} thunk running the matched handler */
  #match(url) {
    for (const { pattern, handler } of this.#routes) {
      const match = pattern.exec({ pathname: url.pathname });
      if (!match) continue;
      const params = match.pathname.groups ?? {};
      dev.log('route', url.pathname, params);
      return () => handler(params, url);
    }
    dev.log('route (not found)', url.pathname);
    const notFound = this.#notFound;
    return notFound ? () => notFound(url) : null;
  }
}
