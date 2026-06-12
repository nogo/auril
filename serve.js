#!/usr/bin/env bun
// Dev server for auril.js: static files, SPA deep-link fallback, live reload.
// Repo tooling — NOT part of the kernel (uses Bun globals; outside jsconfig).
// Usage: bun serve.js [port]   (default 8000)
import { watch } from 'node:fs';
import { join, normalize, sep } from 'node:path';

const root = process.cwd();
const port = Number(process.argv[2]) || 8000;
const enc = new TextEncoder();
const RELOAD = '<script>new EventSource("/__auril_reload").onmessage = () => location.reload()</script>';

/** Live-reload SSE clients. @type {Set<ReadableStreamDefaultController>} */
const clients = new Set();
/** @type {ReturnType<typeof setTimeout> | undefined} */
let debounce;

/** Serve a file; inject the live-reload snippet into HTML before </body>. */
async function serveFile(filePath) {
  const file = Bun.file(filePath);
  if (filePath.endsWith('.html')) {
    const text = await file.text();
    const body = text.includes('</body>') ? text.replace('</body>', RELOAD + '</body>') : text + RELOAD;
    return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  return new Response(file); // Bun infers content-type from the extension
}

/** Nearest ancestor index.html for a path, so /a/b/c deep-links resolve to /a/index.html. */
async function ancestorIndex(path) {
  const segs = path.split('/').filter(Boolean);
  for (let i = segs.length; i >= 0; i--) {
    const candidate = join(root, ...segs.slice(0, i), 'index.html');
    if (await Bun.file(candidate).exists()) return candidate;
  }
  return null;
}

const server = Bun.serve({
  port,
  async fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname);

    if (path === '/__auril_reload') {
      let ctrl;
      const stream = new ReadableStream({
        start(c) { ctrl = c; clients.add(c); c.enqueue(enc.encode('retry: 1000\n\n')); },
        cancel() { clients.delete(ctrl); },
      });
      return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
    }

    const target = normalize(join(root, path.endsWith('/') ? path + 'index.html' : path));
    if (!target.startsWith(root + sep)) return new Response('403 Forbidden', { status: 403 });
    if (await Bun.file(target).exists()) return serveFile(target);

    // SPA fallback: only for navigations (Accept: text/html), never module/asset fetches.
    if ((req.headers.get('accept') || '').includes('text/html')) {
      const fallback = await ancestorIndex(path);
      if (fallback) return serveFile(fallback);
    }
    return new Response('404 Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
  },
  error: (err) => new Response(`500 ${err}`, { status: 500 }),
});

watch(root, { recursive: true }, (_event, name) => {
  if (name && (name.includes('.git') || name.includes('node_modules'))) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    for (const c of clients) {
      try { c.enqueue(enc.encode('data: reload\n\n')); } catch { clients.delete(c); }
    }
  }, 50);
});

console.log(`auril dev server → http://localhost:${server.port}/  (serve repo root, live reload on)`);
