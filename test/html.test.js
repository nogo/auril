import { test, expect } from 'bun:test';
import { html, raw, escapeHtml } from '../src/html.js';

test('escapes interpolated values', () => {
  expect(String(html`<p>${'<b>"x"</b>'}</p>`)).toBe('<p>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</p>');
});

test('raw passes trusted markup through', () => {
  expect(String(html`<div>${raw('<b>ok</b>')}</div>`)).toBe('<div><b>ok</b></div>');
});

test('nested html`` is not double-escaped', () => {
  const inner = html`<span>${'a&b'}</span>`;
  expect(String(html`<div>${inner}</div>`)).toBe('<div><span>a&amp;b</span></div>');
});

test('arrays join, null/false vanish, 0 renders', () => {
  expect(String(html`${[1, 2]}${null}${false}${0}`)).toBe('120');
});

test('arrays of nested html`` join unescaped', () => {
  const items = ['a', 'b'].map((x) => html`<li>${x}</li>`);
  expect(String(html`<ul>${items}</ul>`)).toBe('<ul><li>a</li><li>b</li></ul>');
});

test('escapeHtml covers the five specials', () => {
  expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
});
