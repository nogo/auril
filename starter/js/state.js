// The app's one store: every component renders from it. Server data lives
// here and nowhere else; components keep only drafts and open/closed state.
import { AurilElement, Store } from '../auril/index.js';

export const store = new Store({
  session: null,   // GET api/session's answer, kept for an offline start; null when signed out
  booting: true,   // until the first session answer, or its failure, arrived
  online: navigator.onLine,
  updateReady: false, // a new service worker waits for "update now"
  items: null,     // { list, error } for the home screen; null while loading
}, { persist: ['session'], key: '__APP_KEY__', version: 1 });

AurilElement.store = store;
