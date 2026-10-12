import { test, expect, beforeAll } from 'bun:test';

// happy-dom has no Navigation API; the router reads globalThis.navigation
// once at import, so a fake goes in first.
const navigation = new EventTarget();
let Router;
beforeAll(async () => {
  /** @type {any} */ (globalThis).navigation = navigation;
  ({ Router } = await import('../src/router.js'));
  new Router({ viewTransitions: false }).route('/a', () => {}).start();
});

/** fire a navigate event; answer whether the router intercepted it */
function navigate(url, navigationType) {
  let intercepted = false;
  const event = Object.assign(new Event('navigate'), {
    canIntercept: true, hashChange: false, downloadRequest: null, formData: null,
    navigationType, destination: { url: new URL(url, 'http://localhost').href },
    intercept: () => { intercepted = true; },
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
