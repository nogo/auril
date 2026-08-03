import { test, expect } from 'bun:test';
import { dev } from '../src/dev.js';

test('log() survives being destructured off dev', () => {
  const { log } = dev;
  const enabled = dev.enabled;
  const orig = console.debug;
  /** @type {unknown[][]} */
  const lines = [];
  console.debug = (/** @type {unknown[]} */ ...args) => { lines.push(args); };
  try {
    dev.enabled = true;
    log('hello'); // reads dev.enabled, not this.enabled
  } finally {
    console.debug = orig;
    dev.enabled = enabled;
  }
  expect(lines).toEqual([['[auril]', 'hello']]);
});

test('log() stays silent when disabled', () => {
  const enabled = dev.enabled;
  const orig = console.debug;
  let calls = 0;
  console.debug = () => { calls++; };
  try {
    dev.enabled = false;
    dev.log('quiet');
  } finally {
    console.debug = orig;
    dev.enabled = enabled;
  }
  expect(calls).toBe(0);
});
