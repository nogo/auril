const FIRST_RETRY_MS = 500;
const MAX_RETRY_MS = 10_000;

/**
 * A WebSocket to this page's host that reopens itself after a drop: with a
 * delay doubling from 0.5 s to 10 s, and at once when the tab becomes visible
 * or the network returns. Messages pass through as delivered; the wire format
 * stays app code. onOpen runs on every connect — resend what the server must
 * know there. onClose runs on each drop, not on close(); calling close() in it
 * stops the retries (e.g. the server refused a token).
 * @param {string} path same-origin path, e.g. '/ws?token=…'; ws: or wss: follows the page
 * @param {{ onOpen?: () => void, onMessage?: (data: any) => void, onClose?: () => void }} [handlers]
 * @returns {{ send(data: Parameters<WebSocket['send']>[0]): boolean, close(): void }} send() is false while not open; nothing queues
 */
export function socket(path, { onOpen, onMessage, onClose } = {}) {
  const url = new URL(path, location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ac = new AbortController();
  /** @type {WebSocket | null} */
  let ws = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let retry;
  let delay = FIRST_RETRY_MS;

  function open() {
    clearTimeout(retry);
    if (ac.signal.aborted || (ws && ws.readyState <= WebSocket.OPEN)) return;
    ws = new WebSocket(url);
    ws.onopen = () => { delay = FIRST_RETRY_MS; onOpen?.(); };
    ws.onmessage = (event) => onMessage?.(event.data);
    ws.onclose = () => {
      if (ac.signal.aborted) return;
      onClose?.();
      retry = setTimeout(open, delay); // a no-op if onClose called close()
      delay = Math.min(delay * 2, MAX_RETRY_MS);
    };
  }

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') open(); }, { signal: ac.signal });
  globalThis.addEventListener('online', () => open(), { signal: ac.signal });
  open();
  return {
    send(data) {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(data);
      return true;
    },
    close() {
      ac.abort();
      clearTimeout(retry);
      ws?.close();
    },
  };
}
