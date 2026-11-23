import { test, expect } from 'bun:test';
import { A2uiSurface, BASIC_CATALOG, Surface, check, mediaUrl, parseMessages } from '../kit/a2ui.js';

A2uiSurface.css = []; // happy-dom cannot fetch file: URLs

const tick = () => new Promise((resolve) => queueMicrotask(resolve));

/** A createSurface message holding components and a data model. @param {any[]} components @param {any} [dataModel] */
const create = (components, dataModel = {}) => ({ version: '1.0', createSurface: { surfaceId: 's', catalogId: BASIC_CATALOG, components, dataModel } });

/** Mounts a surface drawn from messages and returns it with its shadow view. @param {any[]} messages */
function mount(messages) {
  const el = /** @type {A2uiSurface} */ (document.createElement('a2ui-surface'));
  el.dataset.source = messages.map((m) => JSON.stringify(m)).join('\n');
  document.body.append(el);
  const view = /** @type {HTMLElement} */ (el.shadowRoot?.querySelector('.a2ui'));
  return { el, view };
}

/** Types into an input the way a browser does: the value, then an input event. @param {Element | null | undefined} input @param {string} value */
function type(input, value) {
  const i = /** @type {HTMLInputElement} */ (input);
  i.value = value;
  i.dispatchEvent(new Event('input', { bubbles: true }));
}

const form = [
  { id: 'root', component: 'Column', children: ['name', 'send'] },
  { id: 'name', component: 'TextField', label: 'Name', value: { '@path': '/form/name' },
    '@checks': [{ condition: { '@call': 'required', args: { value: { '@path': '/form/name' } } }, message: 'Name is required' }] },
  { id: 'send', component: 'Button', child: 'send-label', variant: 'primary',
    '@checks': [{ condition: { '@call': 'required', args: { value: { '@path': '/form/name' } } } }],
    action: { event: { name: 'submit', context: { name: { '@path': '/form/name' }, kind: 'new' } } } },
  { id: 'send-label', component: 'Text', text: 'Send' },
];

test('parseMessages reads one JSON value, an array, or JSON Lines', () => {
  expect(parseMessages('{"a":1}')).toEqual([{ a: 1 }]);
  expect(parseMessages('[{"a":1},{"b":2}]')).toEqual([{ a: 1 }, { b: 2 }]);
  expect(parseMessages('{"a":1}\n\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
  expect(() => parseMessages('{"a":1}\n{oops')).toThrow('line 2');
});

test('check names what is missing or wrong', () => {
  expect(check(JSON.stringify(create(form)))).toBe('');
  expect(check(JSON.stringify(create([{ id: 'x', component: 'Text', text: 'hi' }])))).toBe('no component with id "root"');
  expect(check(JSON.stringify(create([{ id: 'root', component: 'Column', children: ['gone'] }])))).toBe('root: no component with id "gone"');
  expect(check(JSON.stringify(create([{ id: 'root', component: 'Marquee' }])))).toBe('root: unknown component "Marquee"');
  expect(check(JSON.stringify(create([{ id: 'root', component: 'Text', text: 'a', color: 'red' }])))).toBe('root: Text has no property color');
  expect(check(JSON.stringify(create([{ id: 'root', component: 'Button', child: 'x' }])))).toBe('root: Button needs action');
  expect(check(JSON.stringify({ version: '0.9', createSurface: {} }))).toContain('version must be "1.0"');
  expect(check(JSON.stringify({ version: '1.0', createSurface: { surfaceId: 's', catalogId: 'x' } }))).toContain('unknown catalog');
});

test('updateDataModel writes and deletes by JSON Pointer', () => {
  const s = new Surface();
  s.apply(create([], { a: { b: 1 } }));
  s.apply({ version: '1.0', updateDataModel: { surfaceId: 's', path: '/a/c~1d', value: 2 } });
  expect(s.data).toEqual({ a: { b: 1, 'c/d': 2 } });
  s.apply({ version: '1.0', updateDataModel: { surfaceId: 's', path: '/a/b', value: null } });
  expect(s.data).toEqual({ a: { 'c/d': 2 } });
  s.apply({ version: '1.0', updateDataModel: { surfaceId: 's', value: { fresh: true } } });
  expect(s.data).toEqual({ fresh: true });
  expect(() => s.apply({ version: '1.0', updateDataModel: { surfaceId: 'other', value: 1 } })).toThrow('names surface "other"');
});

test('a path through __proto__ never reaches Object.prototype', () => {
  const s = new Surface();
  s.apply(create([]));
  expect(() => s.set('/__proto__/polluted', 1)).toThrow('bad path');
  expect(/** @type {any} */ ({}).polluted).toBeUndefined();
  expect(s.get('/__proto__')).toBeUndefined();
});

test('text is escaped, then drawn with the little Markdown the catalog allows', () => {
  const { view } = mount([create([{ id: 'root', component: 'Text', text: '# Title\n\n**bold** and <img src=x onerror=alert(1)>\n\n- one\n- two' }])]);
  expect(view.querySelector('.h1')?.textContent).toBe('Title');
  expect(view.querySelector('strong')?.textContent).toBe('bold');
  expect(view.querySelector('img')).toBeNull();
  expect(view.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(view.querySelectorAll('li').length).toBe(2);
});

test('typing writes the bound path, and a failing check disables the button', () => {
  const { el, view } = mount([create(form, { form: { name: '' } })]);
  const button = /** @type {HTMLButtonElement} */ (view.querySelector('button[data-action]'));
  expect(button.disabled).toBe(true);
  expect(view.querySelector('.error')).toBeNull(); // untouched fields stay quiet
  type(view.querySelector('input'), 'Ada');
  expect(el.data).toEqual({ form: { name: 'Ada' } });
  expect(/** @type {HTMLButtonElement} */ (view.querySelector('button[data-action]')).disabled).toBe(false);
  type(view.querySelector('input'), '');
  expect(view.querySelector('.error')?.textContent).toBe('Name is required');
});

test('a button sends its event with the context resolved at the click', () => {
  const { el, view } = mount([create(form, { form: { name: 'Ada' } })]);
  /** @type {any[]} */
  const sent = [];
  el.addEventListener('a2ui-action', (e) => sent.push(/** @type {CustomEvent} */ (e).detail));
  type(view.querySelector('input'), 'Grace');
  /** @type {HTMLButtonElement} */ (view.querySelector('button[data-action]')).click();
  expect(sent.length).toBe(1);
  expect(sent[0].version).toBe('1.0');
  expect(sent[0].action).toMatchObject({ name: 'submit', surfaceId: 's', sourceComponentId: 'send', context: { name: 'Grace', kind: 'new' } });
});

test('a template draws one child per item, with relative paths and @index', () => {
  const { view } = mount([create([
    { id: 'root', component: 'List', children: { path: '/people', componentId: 'row' } },
    { id: 'row', component: 'Text', text: { '@call': 'formatString', args: { value: '${@index(offset: 1)}. ${name}' } } },
  ], { people: [{ name: 'Ada' }, { name: 'Grace' }] })]);
  expect([...view.querySelectorAll('.text')].map((t) => t.textContent)).toEqual(['1. Ada', '2. Grace']);
});

test('formatString reads paths and calls, and \\${ stays literal', () => {
  const { view } = mount([create([
    { id: 'root', component: 'Text', text: { '@call': 'formatString', args: { value: 'Hi ${/user/name}, ${formatNumber(value: /n, decimals: 2)} \\${x}' } } },
  ], { user: { name: 'Ada' }, n: 3 })]);
  expect(view.textContent).toBe('Hi Ada, 3.00 ${x}');
});

test('the basic functions answer as the guide specifies', () => {
  const s = new Surface();
  s.apply(create([
    { id: 'root', component: 'Column', children: ['a', 'b', 'c', 'd', 'e'] },
    { id: 'a', component: 'Text', text: { '@call': 'formatCurrency', args: { value: 1234.5, currency: 'EUR' } } },
    { id: 'b', component: 'Text', text: { '@call': 'formatDate', args: { value: '2026-11-03', format: "dd.MM.yyyy 'x'" } } },
    { id: 'c', component: 'Text', text: { '@call': 'pluralize', args: { value: 1, one: 'one item', other: 'many items' } } },
    { id: 'd', component: 'Text', text: { '@call': 'formatCurrency', args: { value: 1, currency: 'not a code' } } },
    { id: 'e', component: 'CheckBox', label: 'x', value: { '@call': 'and', args: { values: [true, { '@call': 'not', args: { value: false } }] } } },
  ]));
  const { view } = mount([create([...s.components.values()])]);
  const texts = [...view.querySelectorAll('.text')].map((t) => t.textContent);
  expect(texts[0]).toContain('1,234.50');
  expect(texts[1]).toBe('03.11.2026 x');
  expect(texts[2]).toBe('one item');
  expect(texts[3]).toBe(''); // a bad currency code draws as empty
  expect(/** @type {HTMLInputElement} */ (view.querySelector('input[type="checkbox"]')).checked).toBe(true);
});

test('regex rejects nested quantifiers and works within the dialect', () => {
  const field = (/** @type {string} */ pattern) => [create([
    { id: 'root', component: 'CheckBox', label: 'x', value: { '@call': 'regex', args: { value: 'aaaa', pattern } } },
  ])];
  expect(/** @type {HTMLInputElement} */ (mount(field('^a+$')).view.querySelector('input')).checked).toBe(true);
  expect(/** @type {HTMLInputElement} */ (mount(field('^(a+)+$')).view.querySelector('input')).checked).toBe(false);
  expect(/** @type {HTMLInputElement} */ (mount(field('(a)\\1')).view.querySelector('input')).checked).toBe(false);
});

test('a choice picker keeps a selection while a filter hides it', () => {
  const { el, view } = mount([create([
    { id: 'root', component: 'ChoicePicker', variant: 'multipleSelection', filterable: true, value: { '@path': '/picked' },
      options: [{ label: 'Apple', value: 'a' }, { label: 'Banana', value: 'b' }, { label: 'Cherry', value: 'c' }] },
  ], { picked: ['a'] })]);
  type(view.querySelector('.filter'), 'an');
  expect([...view.querySelectorAll('.choice')].map((c) => c.textContent)).toEqual(['Banana']);
  const banana = /** @type {HTMLInputElement} */ (view.querySelector('input[value="b"]'));
  banana.checked = true;
  banana.dispatchEvent(new Event('change', { bubbles: true }));
  expect(el.data.picked).toEqual(['a', 'b']);
});

test('tabs draw only the selected child', () => {
  const { view } = mount([create([
    { id: 'root', component: 'Tabs', tabs: [{ title: 'One', child: 'one' }, { title: 'Two', child: 'two' }] },
    { id: 'one', component: 'Text', text: 'first' },
    { id: 'two', component: 'Text', text: 'second' },
  ])]);
  expect(view.querySelector('[role="tabpanel"]')?.textContent).toBe('first');
  /** @type {HTMLButtonElement} */ (view.querySelectorAll('[role="tab"]')[1]).click();
  expect(view.querySelector('[role="tabpanel"]')?.textContent).toBe('second');
  expect(view.querySelectorAll('[role="tab"]')[1].getAttribute('aria-selected')).toBe('true');
});

test('media URLs follow the guide: no script, no other scheme, no protocol-relative host', () => {
  expect(mediaUrl(' https://example.com/a.png ')).toBe('https://example.com/a.png');
  expect(mediaUrl('/img/a.png')).toBe('/img/a.png');
  expect(mediaUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  for (const bad of ['javascript:alert(1)', 'java\tscript:alert(1)', '//evil.com/a.png', '/\\evil.com', '\\\\evil.com', 'https:evil.com', 'file:///etc/passwd', '']) {
    expect(mediaUrl(bad)).toBe('');
  }
});

test('an Icon draws a known name, and an svgPath only when it is drawing commands', () => {
  const { view } = mount([create([
    { id: 'root', component: 'Row', children: ['a', 'b', 'c'] },
    { id: 'a', component: 'Icon', name: 'mail' },
    { id: 'b', component: 'Icon', name: { svgPath: 'M0 0L10 10Z' } },
    { id: 'c', component: 'Icon', name: { svgPath: 'M0 0"/><script>alert(1)</script>' } },
  ])]);
  expect(view.querySelectorAll('svg').length).toBe(2);
  expect(view.querySelector('script')).toBeNull();
});

test('a broken source draws the reason, and a missing child a placeholder', async () => {
  const { view } = mount([{ version: '1.0', createSurface: { surfaceId: 's', catalogId: 'nope' } }]);
  expect(view.querySelector('.failed')?.textContent).toContain('unknown catalog');
  const streaming = mount([create([{ id: 'root', component: 'Column', children: ['later'] }])]);
  expect(streaming.view.querySelector('.missing')).not.toBeNull();
  streaming.el.apply({ version: '1.0', updateComponents: { surfaceId: 's', components: [{ id: 'later', component: 'Text', text: 'here' }] } });
  await tick();
  expect(streaming.view.textContent).toBe('here');
});

test('a component that points at itself draws a notice instead of hanging', () => {
  const { view } = mount([create([{ id: 'root', component: 'Card', child: 'root' }])]);
  expect(view.querySelector('.failed')?.textContent).toBe('surface too large or too deep');
});

test('a modal trigger opens its dialog instead of running the button', () => {
  const { el, view } = mount([create([
    { id: 'root', component: 'Modal', trigger: 'open', content: 'body' },
    { id: 'open', component: 'Button', child: 'open-label', action: { event: { name: 'never' } } },
    { id: 'open-label', component: 'Text', text: 'Open' },
    { id: 'body', component: 'Text', text: 'Inside' },
  ])]);
  let sent = 0;
  el.addEventListener('a2ui-action', () => sent++);
  /** @type {HTMLButtonElement} */ (view.querySelector('.trigger button')).click();
  expect(/** @type {HTMLDialogElement} */ (view.querySelector('dialog')).open).toBe(true);
  expect(sent).toBe(0);
});

test('a chain deeper than 40 draws a notice', () => {
  const chain = Array.from({ length: 45 }, (_, i) => ({ id: i ? `n${i}` : 'root', component: 'Card', child: `n${i + 1}` }));
  const { view } = mount([create([...chain, { id: 'n45', component: 'Text', text: 'bottom' }])]);
  expect(view.querySelector('.failed')?.textContent).toBe('surface too large or too deep');
});

test('openUrl runs only from a click, and only for http and https', () => {
  /** @type {any[][]} */
  const opened = [];
  const open = window.open;
  window.open = /** @type {any} */ ((/** @type {any[]} */ ...args) => { opened.push(args); return null; });
  try {
    const go = (/** @type {string} */ url) => ({ functionCall: { '@call': 'openUrl', args: { url } } });
    const { view } = mount([create([
      { id: 'root', component: 'Column', children: ['auto', 'ok', 'bad'] },
      { id: 'auto', component: 'Text', text: { '@call': 'openUrl', args: { url: 'https://example.com/auto' } } },
      { id: 'ok', component: 'Button', child: 'l', action: go('https://example.com/a') },
      { id: 'bad', component: 'Button', child: 'l', action: go('javascript:alert(1)') },
      { id: 'l', component: 'Text', text: 'go' },
    ])]);
    expect(opened).toEqual([]); // drawing never opens
    const [ok, bad] = /** @type {HTMLButtonElement[]} */ ([...view.querySelectorAll('button[data-action]')]);
    ok.click();
    bad.click();
    expect(opened).toEqual([['https://example.com/a', '_blank', 'noopener,noreferrer']]);
  } finally {
    window.open = open;
  }
});

test('@accessibility names a component and can hide it', () => {
  const { view } = mount([create([
    { id: 'root', component: 'Row', children: ['a', 'b'] },
    { id: 'a', component: 'Icon', name: 'mail', '@accessibility': { label: 'Mail' } },
    { id: 'b', component: 'Text', text: 'x', '@accessibility': { hidden: true } },
  ])]);
  expect(view.querySelector('[aria-label="Mail"]')).not.toBeNull();
  expect(view.querySelector('.Text')?.getAttribute('aria-hidden')).toBe('true');
});

test('a heading, a paragraph and a list may share one block', () => {
  const { view } = mount([create([{ id: 'root', component: 'Text', text: '## Book\nFridays fill up.\n- one\n- two\nafter' }])]);
  const html = view.querySelector('.text')?.innerHTML;
  expect(html).toBe('<p class="h h2">Book</p><p>Fridays fill up.</p><ul><li>one</li><li>two</li></ul><p>after</p>');
});

test('a new data-source draws a new surface', () => {
  const { el, view } = mount([create([{ id: 'root', component: 'Text', text: 'first' }])]);
  el.dataset.source = JSON.stringify(create([{ id: 'root', component: 'Text', text: 'second' }]));
  expect(view.textContent).toBe('second');
});
