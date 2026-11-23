// Every request to the server goes through here; components never fetch.
// It tracks whether the server is reachable and turns a 401 into the login
// screen. Paths are relative to the app's root, so the app runs under any prefix.
import { store } from './state.js';

const ROOT = new URL('../', import.meta.url);

// ApiError is an answer the server refused: status, message, and the field at
// fault when one is.
export class ApiError extends Error {
  /** @param {number} status @param {string} message @param {string} [field] */
  constructor(status, message, field = '') {
    super(message);
    this.status = status;
    this.field = field;
  }
}

// OfflineError is a request that never got an answer.
export class OfflineError extends Error {}

/** @param {string} method @param {string} path @param {unknown} [body] */
async function request(method, path, body) {
  /** @type {RequestInit & { headers: Record<string, string> }} */
  const init = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(new URL(path, ROOT), init);
  } catch {
    if (store.state.online) store.set({ online: false });
    throw new OfflineError('offline');
  }
  if (!store.state.online) store.set({ online: true });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401) {
    store.set({ session: null });
    throw new ApiError(401, data?.error ?? 'unauthorized');
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText, data?.field ?? '');
  return data;
}

// The server's contract (kit/UI.md, "Starter"): a session, sign-out, and the
// example screen's items. Replace the items with the app's own calls.
export const session = () => request('GET', 'api/session');
export const logout = () => request('POST', 'auth/logout');
export const loginUrl = () => new URL('auth/login', ROOT).href;
export const items = () => request('GET', 'api/items');
/** @param {{ name: string }} item */
export const addItem = (item) => request('POST', 'api/items', item);
/** @param {string} id */
export const deleteItem = (id) => request('DELETE', `api/items/${encodeURIComponent(id)}`);
