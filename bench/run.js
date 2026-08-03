#!/usr/bin/env bun
// Playwright runner for the auril.js benches. Repo tooling — NOT part of the
// kernel (Bun + Playwright globals, outside jsconfig, never vendored).
//
// Drives the *system* Chrome through playwright-core, so there is no browser
// download: the dev dependency is ~5 MB and the browser is the one already
// installed. happy-dom cannot host these benches — no layout, no moveBefore,
// no real morph timing — so a browser is not optional here.
//
// Usage:
//   bun run bench                     # 4x CPU throttle (the target profile)
//   bun bench/run.js --throttle=1     # unthrottled
//   bun bench/run.js --samples=200
//   bun bench/run.js --json           # machine-readable only
import { chromium } from 'playwright-core';
import { join } from 'node:path';

/** @param {string} name @param {number} fallback */
const flag = (name, fallback) => {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

const jsonOnly = process.argv.includes('--json');
const throttle = flag('throttle', 4);
const samples = flag('samples', 40);
const warmup = flag('warmup', 10);
const port = flag('port', 8123);

const root = join(import.meta.dir, '..');
const url = `http://localhost:${port}/bench/?driven`;
/** @param {...unknown} args */
const log = (...args) => { if (!jsonOnly) console.log(...args); };

const server = Bun.spawn(['bun', 'serve.js', String(port)], { cwd: root, stdout: 'ignore', stderr: 'inherit' });
for (let attempt = 0; ; attempt++) {
  try {
    await fetch(url);
    break;
  } catch {
    if (attempt > 50) { server.kill(); throw new Error('dev server did not come up'); }
    await Bun.sleep(100);
  }
}

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
} catch (err) {
  server.kill();
  console.error(
    'Could not launch Chrome. playwright-core uses the system browser — install Google\n' +
    'Chrome, or run `bun add -d playwright && bunx playwright install chromium` and drop\n' +
    'the `channel` option above.',
  );
  throw err;
}

const page = await browser.newPage();
/** @type {Error[]} */
const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err));

if (throttle > 1) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
}

await page.goto(url, { waitUntil: 'load' });
const results = await page.evaluate(
  (opts) => /** @type {any} */ (globalThis).runBench(opts),
  { samples, warmup },
);
const version = browser.version();
await browser.close();
server.kill();

if (pageErrors.length) {
  for (const err of pageErrors) console.error(err);
  process.exit(1);
}

// Written after the browser closes: serve.js watches the repo, and writing
// while the page is open would live-reload it mid-run.
const payload = { ...results, chrome: version, throttle, recordedAt: new Date().toISOString() };
await Bun.write(join(import.meta.dir, 'results.json'), `${JSON.stringify(payload, null, 2)}\n`);

if (jsonOnly) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  log('\nauril.js — benchmarks');
  log(`Chrome ${version} (headless) · CPU throttle ${throttle}x · ${samples} samples, ${warmup} warmup discarded`);
  log('Kernel time only: layout and paint excluded. Operations timed in auto-calibrated batches.');

  for (const block of results.blocks) {
    /** @type {string[][]} */
    const rows = block.rows;
    const width = block.columns.map((/** @type {string} */ col, /** @type {number} */ i) =>
      Math.max(col.length, ...rows.map((row) => row[i].length)));
    /** @param {string[]} cells */
    const line = (cells) => cells.map((cell, i) => cell.padStart(width[i])).join('  ');

    log(`\n${block.title}`);
    log(block.note);
    log('');
    log(line(block.columns));
    log(width.map((/** @type {number} */ w) => '─'.repeat(w)).join('  '));
    for (const row of rows) log(line(row));
    if (block.verdict) {
      const { pass, label, hard } = block.verdict;
      log(hard ? `${pass ? 'PASS' : 'FAIL'}  ${label}` : `NOTE  ${label}`);
    }
  }

  const failed = results.blocks.filter((/** @type {any} */ b) => b.verdict?.hard && !b.verdict.pass);
  log(`\n${failed.length ? `${failed.length} budget(s) exceeded` : 'All budgets met'} · wrote bench/results.json\n`);
  if (failed.length) process.exitCode = 1;
}
