import { test, expect, beforeAll } from 'bun:test';

// happy-dom has no Navigation API; the router reads globalThis.navigation
// once at import, so a fake goes in first.
const navigation = new EventTarget();
let Router;
/** @type {(value?: unknown) => void} */
let finishSlow = () => {};
const slow = new Promise((resolve) => { finishSlow = resolve; });
beforeAll(async () => {
  /** @type {any} */ (globalThis).navigation = navigation;
  ({ Router } = await import('../src/router.js'));
  new Router()
    .route('/a', () => {})
    .route('/slow', () => slow)
    .start();
});

/** fire a navigate event; answer whether the router intercepted it */
function navigate(url, navigationType) {
  return dispatch(url, navigationType) !== null;
}

/** fire a navigate event; answer the options the router passed to intercept(), or null */
function dispatch(url, navigationType) {
  let intercepted = null;
  const event = Object.assign(new Event('navigate'), {
    canIntercept: true, hashChange: false, downloadRequest: null, formData: null,
    navigationType, destination: { url: new URL(url, 'http://localhost').href },
    intercept: (options) => { intercepted = options; },
  });
  navigation.dispatchEvent(event);
  return intercepted;
}

test('a link or go() to a route is handled in the page', () => {
  expect(navigate('/a', 'push')).toBe(true);
});

test('a reload is left to the browser, so it loads the page again', () => {
  // location.reload() after a service-worker update must fetch the new code;
  // intercepted, it only re-ran the route on the old code.
  expect(navigate('/a', 'reload')).toBe(false);
});

test('a navigation finishes only once the promise its route handler returned settles', async () => {
  // An app that wraps its update in a View Transition returns updateCallbackDone;
  // finishing earlier would restore scroll and reset focus against the old DOM.
  const done = dispatch('/slow', 'push').handler();
  let finished = false;
  done.then(() => { finished = true; });
  await Promise.resolve();
  await Promise.resolve();
  expect(finished).toBe(false);
  finishSlow();
  await done;
  expect(finished).toBe(true);
});
