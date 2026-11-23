// __APP_NAME__: starts the session and the service worker, and shows the
// screen the state asks for. Screens are swapped whole; each renders itself
// from the store. Add a screen: a module that defines its element, and a
// line in screenFor().
import { store } from './state.js';
import { loadSession } from './session.js';
import { registerServiceWorker } from './update.js';
import './app-bar.js';
import './login.js';
import './home.js';

/** @param {typeof store.state} s */
function screenFor(s) {
  if (!s.session) return s.booting ? '' : 'login-screen';
  return 'home-screen';
}

const root = /** @type {HTMLElement} */ (document.getElementById('app'));
let shown = /** @type {string | null} */ (null);
store.subscribe((s) => {
  const tag = screenFor(s);
  root.setAttribute('aria-busy', String(tag === ''));
  if (tag === shown) return;
  shown = tag;
  root.replaceChildren(...(tag ? [document.createElement(tag)] : []));
});

addEventListener('online', () => store.set({ online: true }));
addEventListener('offline', () => store.set({ online: false }));

loadSession();
registerServiceWorker();
