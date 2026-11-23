import { test, expect, beforeEach, afterEach } from 'bun:test';
import { socket } from '../src/socket.js';

/** A stand-in for the browser's WebSocket that the test opens and drops by hand. */
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  /** @type {FakeSocket[]} */
  static all = [];
  readyState = 0;
  /** @type {string[]} */
  sent = [];
  /** @type {(() => void) | null} */ onopen = null;
  /** @type {((e: { data: unknown }) => void) | null} */ onmessage = null;
  /** @type {(() => void) | null} */ onclose = null;
  /** @param {URL | string} url */
  constructor(url) { this.url = String(url); FakeSocket.all.push(this); }
  /** @param {string} data */
  send(data) { this.sent.push(data); }
  close() { this.drop(); }
  open() { this.readyState = 1; this.onopen?.(); }
  drop() { this.readyState = 3; this.onclose?.(); }
}

// happy-dom starts at about:blank, where a relative socket path has no host.
/** @type {any} */ (globalThis).happyDOM.setURL('http://localhost:3000/');

const real = { WebSocket: globalThis.WebSocket, setTimeout: globalThis.setTimeout };
/** @type {number[]} */
let delays;
beforeEach(() => {
  FakeSocket.all = [];
  delays = [];
  /** @type {any} */ (globalThis).WebSocket = FakeSocket;
  // Record retry delays instead of waiting them out; the retry itself runs at once.
  /** @type {any} */ (globalThis).setTimeout = (/** @type {() => void} */ fn, /** @type {number} */ ms) => { delays.push(ms); fn(); return 0; };
});
afterEach(() => Object.assign(globalThis, real));

const last = () => FakeSocket.all[FakeSocket.all.length - 1];

test('it connects to the path on this host, ws: for an http: page', () => {
  const s = socket('/ws?token=t');
  expect(last().url).toBe(`ws://${location.host}/ws?token=t`);
  s.close();
});

test('it hands each message to onMessage unchanged', () => {
  /** @type {unknown[]} */
  const got = [];
  const s = socket('/ws', { onMessage: (data) => got.push(data) });
  last().onmessage?.({ data: 'changed' });
  expect(got).toEqual(['changed']);
  s.close();
});

test('send() is false until the socket is open, then delivers', () => {
  const s = socket('/ws');
  expect(s.send('a')).toBe(false);
  last().open();
  expect(s.send('b')).toBe(true);
  expect(last().sent).toEqual(['b']);
  s.close();
});

test('a dropped socket reopens with a delay that doubles to 10 s', () => {
  const s = socket('/ws');
  for (let i = 0; i < 6; i++) last().drop();
  expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 10000]);
  expect(FakeSocket.all.length).toBe(7);
  s.close();
});

test('an open resets the delay and runs onOpen on every connect', () => {
  let opens = 0;
  const s = socket('/ws', { onOpen: () => opens++ });
  last().drop();
  last().drop();
  last().open();
  last().drop();
  last().open();
  expect(delays).toEqual([500, 1000, 500]);
  expect(opens).toBe(2);
  s.close();
});

test('onClose runs on a drop, and close() inside it stops the retries', () => {
  // An app that learns the server refused it (a stale token) stops here.
  let closes = 0;
  const s = socket('/ws', { onClose: () => { closes++; s.close(); } });
  last().drop();
  expect(closes).toBe(1);
  expect(FakeSocket.all.length).toBe(1);
});

test('a tab that becomes visible reconnects at once', () => {
  /** @type {any} */ (globalThis).setTimeout = () => 0; // a pending retry that never fires
  const s = socket('/ws');
  last().drop();
  expect(FakeSocket.all.length).toBe(1);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(FakeSocket.all.length).toBe(2);
  s.close();
});

test('close() stops reconnecting and does not count as a drop', () => {
  let closes = 0;
  const s = socket('/ws', { onClose: () => closes++ });
  s.close();
  expect(closes).toBe(0);
  document.dispatchEvent(new Event('visibilitychange'));
  dispatchEvent(new Event('online'));
  expect(FakeSocket.all.length).toBe(1);
});

test('an https: page connects with wss:', () => {
  /** @type {any} */ (globalThis).happyDOM.setURL('https://localhost:3000/');
  try {
    const s = socket('/ws');
    expect(last().url).toBe('wss://localhost:3000/ws');
    s.close();
  } finally {
    /** @type {any} */ (globalThis).happyDOM.setURL('http://localhost:3000/');
  }
});
