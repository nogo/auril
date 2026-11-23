// Who is signed in: loads api/session at start, and signs out.
import { store } from './state.js';
import * as api from './api.js';

export async function loadSession() {
  try {
    store.set({ session: await api.session() });
  } catch {
    // 401: api.js cleared the session. Offline: keep the one from last time.
  }
  store.set({ booting: false });
}

export async function logout() {
  try {
    await api.logout();
  } catch {
    // Offline the cookie stays; signing out here still hides the data.
  }
  store.set({ session: null, items: null });
}
