// The service worker and the update notice. A new version never reloads by
// itself: a banner offers "Update now" or "Later", so no typed text is lost.
import { AurilElement, html } from '../auril/index.js';
import { store } from './state.js';

/** @type {ServiceWorker | null} */
let waiting = null;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).then((reg) => {
    /** @param {ServiceWorker} worker */
    const offer = (worker) => {
      waiting = worker;
      store.set({ updateReady: true });
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!waiting || reloading) return; // only after "Update now"
    reloading = true;
    location.reload();
  });
}

class UpdateBanner extends AurilElement {
  #later = false;

  onConnect() {
    this.watch((s) => s.updateReady, () => this.update());
    this.delegate('click', '#update-now', () => waiting?.postMessage('skip-waiting'));
    this.delegate('click', '#update-later', () => {
      this.#later = true;
      this.update();
    });
  }

  render() {
    if (!store.state.updateReady || this.#later) return '';
    return html`<div class="banner" role="status">
      <span>A new version is ready.</span>
      <button type="button" id="update-now" class="primary">Update now</button>
      <button type="button" id="update-later" class="borderless">Later</button>
    </div>`;
  }
}
customElements.define('update-banner', UpdateBanner);
