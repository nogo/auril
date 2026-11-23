// A2UI v1.0 renderer for the basic catalog: an agent sends UI as data, this
// file draws it with its own code, so nothing the agent writes runs.
//
//   <a2ui-surface data-source="…JSONL or a JSON array of messages…"></a2ui-surface>
//   el.apply(message)             // one more message, for a stream
//   el.addEventListener('a2ui-action', (e) => send(e.detail))  // {version, action}
//
// check(text) answers why a source cannot be drawn, or '' when it can: hosts
// show the source as code with that reason instead of a broken surface.
//
// Each surface draws into its own shadow root, so a parent's morph never wipes
// it and the host's CSS never reaches in. Colours come in through the tokens
// of kit/tokens.css, which inherit into the shadow root, and the classes are
// kit/base.css's, so an app screen and a surface look alike.
//
// Covered: createSurface, updateComponents, updateDataModel, deleteSurface;
// all 18 basic components; the 14 basic functions and @index; @checks.
// Not covered: function calls between renderer and agent, catalog
// negotiation, sendDataModel (read el.data instead), TR35 dates beyond the
// common tokens, and the regex safety rules 3 and 4.
import { AurilElement, html, raw, morph } from '../src/index.js';
import { icon } from './icons.js';

export const BASIC_CATALOG = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';
const MAX_NODES = 2000; // a surface past this draws a notice, not a frozen tab
const MAX_DEPTH = 40;

// Each component: [required props, optional props]. Any other prop is an error,
// as the catalog's `unevaluatedProperties: false` makes it.
/** @type {Record<string, [string[], string[]]>} */
const CATALOG = {
  Text: [['text'], ['variant']],
  Image: [['url'], ['description', 'fit', 'variant']],
  Icon: [['name'], []],
  Video: [['url'], ['posterUrl']],
  AudioPlayer: [['url'], ['description']],
  Row: [['children'], ['justify', 'align']],
  Column: [['children'], ['justify', 'align']],
  List: [['children'], ['direction', 'align']],
  Card: [['child'], []],
  Tabs: [['tabs'], []],
  Modal: [['trigger', 'content'], []],
  Divider: [[], ['axis']],
  Button: [['child', 'action'], ['variant', '@checks']],
  TextField: [['label', 'value'], ['placeholder', 'variant', '@checks']],
  CheckBox: [['label', 'value'], ['@checks']],
  ChoicePicker: [['options', 'value'], ['label', 'variant', 'displayStyle', 'filterable', '@checks']],
  Slider: [['value', 'max'], ['label', 'min', 'steps', '@checks']],
  DateTimeInput: [['value'], ['enableDate', 'enableTime', 'min', 'max', 'label', '@checks']],
};
const COMMON = ['id', 'component', '@catalogId', '@accessibility', '@metadata', 'weight'];

/** @typedef {Record<string, any>} Component */
/** @typedef {{ base: string, index: number } | null} Scope  the template item a relative path reads from */

// ---- messages and the data model ------------------------------------------

/**
 * The messages in a source: one JSON value (a message or an array of them),
 * or JSON Lines.
 * @param {string} text
 * @returns {any[]}
 */
export function parseMessages(text) {
  const t = text.trim();
  if (!t) throw new Error('no messages');
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : [v];
  } catch {
    // Not one JSON value: read it as JSON Lines below.
  }
  return t.split('\n').flatMap((line, i) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch (err) {
      throw new Error(`line ${i + 1}: ${/** @type {Error} */ (err).message}`);
    }
  });
}

/** @param {string} p a JSON Pointer; "/" and "" both name the whole model */
function tokens(p) {
  if (typeof p !== 'string' || (p !== '' && !p.startsWith('/'))) throw new Error(`bad path ${JSON.stringify(p)}`);
  if (p === '' || p === '/') return [];
  const ts = p.slice(1).split('/').map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
  // A model-written "__proto__" step would write into Object.prototype.
  if (ts.some((t) => t === '__proto__' || t === 'constructor' || t === 'prototype')) throw new Error(`bad path ${JSON.stringify(p)}`);
  return ts;
}

/** One surface's components and data model, without any DOM. */
export class Surface {
  id = '';
  /** @type {Map<string, Component>} */
  components = new Map();
  /** @type {any} */
  data = {};

  /** @param {any} msg */
  apply(msg) {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw new Error('a message must be an object');
    if (msg.version !== '1.0') throw new Error(`version must be "1.0", not ${JSON.stringify(msg.version)}`);
    const kinds = Object.keys(msg).filter((k) => k !== 'version');
    if (kinds.length !== 1) throw new Error('a message holds exactly one of createSurface, updateComponents, updateDataModel, deleteSurface');
    const kind = kinds[0];
    const body = msg[kind] ?? {};
    if (kind === 'createSurface') {
      if (this.id) throw new Error(`surface ${JSON.stringify(this.id)} exists already`);
      if (typeof body.surfaceId !== 'string' || !body.surfaceId) throw new Error('createSurface needs a surfaceId');
      if (body.catalogId !== BASIC_CATALOG) throw new Error(`unknown catalog ${JSON.stringify(body.catalogId)}; only the basic catalog is drawn`);
      this.id = body.surfaceId;
      if (body.dataModel !== undefined) this.data = structuredClone(body.dataModel);
      if (body.components !== undefined) this.#put(body.components);
      return;
    }
    if (!['updateComponents', 'updateDataModel', 'deleteSurface'].includes(kind)) throw new Error(`unsupported message ${kind}`);
    if (body.surfaceId !== this.id) throw new Error(`${kind} names surface ${JSON.stringify(body.surfaceId)}, not ${JSON.stringify(this.id)}`);
    if (kind === 'updateComponents') this.#put(body.components);
    else if (kind === 'updateDataModel') this.set(body.path ?? '/', structuredClone(body.value));
    else this.components.clear();
  }

  /** @param {unknown} list */
  #put(list) {
    if (!Array.isArray(list)) throw new Error('components must be an array');
    for (const c of list) {
      checkComponent(c);
      this.components.set(c.id, c);
    }
  }

  /** The value at p, or undefined; a malformed path reads as missing. @param {string} p */
  get(p) {
    let ts;
    try {
      ts = tokens(p);
    } catch {
      return undefined;
    }
    let v = this.data;
    for (const t of ts) {
      if (v === null || typeof v !== 'object' || !Object.hasOwn(v, t)) return undefined;
      v = v[t];
    }
    return v;
  }

  /** Writes value at p; null or undefined deletes the key. @param {string} p @param {unknown} value */
  set(p, value) {
    const ts = tokens(p);
    if (ts.length === 0) {
      this.data = value ?? {};
      return;
    }
    let o = this.data;
    for (let i = 0; i < ts.length - 1; i++) {
      if (o[ts[i]] === null || typeof o[ts[i]] !== 'object') o[ts[i]] = /^\d+$/.test(ts[i + 1]) ? [] : {};
      o = o[ts[i]];
    }
    const last = ts[ts.length - 1];
    if (value != null) o[last] = value;
    else if (Array.isArray(o)) o.splice(Number(last), 1);
    else delete o[last];
  }
}

/** @param {any} c */
function checkComponent(c) {
  if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id) throw new Error('a component needs a string id');
  const spec = CATALOG[c.component];
  if (!spec) throw new Error(`${c.id}: unknown component ${JSON.stringify(c.component)}`);
  if (c['@catalogId'] !== undefined && c['@catalogId'] !== BASIC_CATALOG) throw new Error(`${c.id}: unknown catalog ${JSON.stringify(c['@catalogId'])}`);
  const [required, optional] = spec;
  for (const k of required) if (c[k] === undefined) throw new Error(`${c.id}: ${c.component} needs ${k}`);
  for (const k of Object.keys(c)) {
    if (!COMMON.includes(k) && !required.includes(k) && !optional.includes(k)) throw new Error(`${c.id}: ${c.component} has no property ${k}`);
  }
}

/** The ids a component points at. @param {Component} c */
function refs(c) {
  /** @type {unknown[]} */
  const out = [c.child, c.trigger, c.content];
  if (Array.isArray(c.children)) out.push(...c.children);
  else if (c.children) out.push(c.children.componentId);
  if (Array.isArray(c.tabs)) out.push(...c.tabs.map((/** @type {any} */ t) => t?.child));
  return out.filter((id) => id !== undefined);
}

/**
 * Why a source cannot be drawn, or '' when it can. A closed source must be
 * whole: a root, and every id it points at.
 * @param {string} text
 */
export function check(text) {
  try {
    const s = new Surface();
    for (const m of parseMessages(text)) s.apply(m);
    if (!s.components.has('root')) return 'no component with id "root"';
    for (const c of s.components.values()) {
      for (const id of refs(c)) if (typeof id !== 'string' || !s.components.has(id)) return `${c.id}: no component with id ${JSON.stringify(id)}`;
    }
    return '';
  } catch (err) {
    return /** @type {Error} */ (err).message;
  }
}

// ---- values and functions ---------------------------------------------------

/** @param {string} p @param {Scope} scope */
const absolute = (p, scope) => (p.startsWith('/') ? p : `${scope ? scope.base : ''}/${p}`);

const locale = () => document.documentElement.lang || undefined;

/**
 * A literal, a {"@path"} binding or a {"@call"} function call, resolved.
 * @param {Surface} s @param {unknown} v @param {Scope} scope @param {boolean} [activated] inside a user's click
 */
function resolve(s, v, scope, activated = false) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const o = /** @type {Record<string, any>} */ (v);
  if (typeof o['@path'] === 'string') return s.get(absolute(o['@path'], scope));
  if (typeof o['@call'] === 'string') return call(s, o['@call'], o.args ?? {}, scope, activated);
  return v;
}

/** @param {Surface} s @param {string} name @param {Record<string, any>} args @param {Scope} scope @param {boolean} activated */
function call(s, name, args, scope, activated) {
  /** @type {Record<string, any>} */
  const a = {};
  for (const [k, v] of Object.entries(args)) a[k] = Array.isArray(v) ? v.map((x) => resolve(s, x, scope)) : resolve(s, v, scope);
  try {
    if (name === '@index') return (scope?.index ?? 0) + (Number(a.offset) || 0);
    if (name === 'formatString') return formatString(s, String(a.value ?? ''), scope);
    if (name === 'openUrl') return activated ? openUrl(a.url) : undefined; // requiresUserActivation
    return Object.hasOwn(FUNCTIONS, name) ? FUNCTIONS[name](a) : undefined;
  } catch {
    return undefined; // a bad currency code or date draws as empty, not as a broken surface
  }
}

/** @param {unknown} v */
const num = (v) => (typeof v === 'number' ? v : String(v ?? '').trim() === '' ? NaN : Number(v));

/** @type {Record<string, (a: Record<string, any>) => unknown>} */
const FUNCTIONS = {
  required: ({ value }) => !(value == null || value === '' || (Array.isArray(value) && value.length === 0)),
  regex: ({ value, pattern }) => matches(String(pattern), String(value ?? '')),
  length: ({ value, min, max }) => {
    const n = [...String(value ?? '')].length;
    return (min == null || n >= min) && (max == null || n <= max);
  },
  numeric: ({ value, min, max }) => {
    const n = num(value);
    return !Number.isNaN(n) && (min == null || n >= min) && (max == null || n <= max);
  },
  email: ({ value }) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '')),
  formatNumber: ({ value, decimals, grouping }) => numberFormat(value, decimals, grouping, {}),
  formatCurrency: ({ value, currency, decimals, grouping }) => numberFormat(value, decimals, grouping, { style: 'currency', currency }),
  formatDate: ({ value, format }) => formatDate(value, String(format ?? 'yyyy-MM-dd')),
  pluralize: (a) => a[new Intl.PluralRules(locale()).select(num(a.value))] ?? a.other ?? '',
  and: ({ values }) => Array.isArray(values) && values.every(valid),
  or: ({ values }) => Array.isArray(values) && values.some(valid),
  not: ({ value }) => !valid(value),
};

/** A check result is a boolean or {valid}. @param {unknown} r */
const valid = (r) => (r && typeof r === 'object' ? !!(/** @type {any} */ (r).valid) : !!r);

/** @param {unknown} value @param {unknown} decimals @param {unknown} grouping @param {Intl.NumberFormatOptions} opts */
function numberFormat(value, decimals, grouping, opts) {
  const d = typeof decimals === 'number' ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : {};
  return new Intl.NumberFormat(locale(), { ...opts, ...d, useGrouping: grouping !== false }).format(num(value));
}

/**
 * The A2UI regex dialect, roughly: Unicode mode, no backreferences, lookbehind,
 * named groups or property escapes, and no quantified group that holds an
 * unbounded quantifier — the shape behind most catastrophic backtracking.
 * @param {string} pattern @param {string} value
 */
function matches(pattern, value) {
  if ([...value].length > 4096) return false;
  if ([...pattern].length > 256) throw new Error('pattern too long');
  if (/\\[1-9]|\\k<|\(\?<[=!]|\(\?<[A-Za-z]|\\[pP]\{|\\c/.test(pattern)) throw new Error('pattern outside the dialect');
  if (/\([^()]*(?:[*+]|\{\d+,\})[^()]*\)(?:[*+]|\{\d*,?\d*\})/.test(pattern)) throw new Error('nested quantifier');
  return new RegExp(pattern, 'u').test(value);
}

/** @param {unknown} url */
function openUrl(url) {
  const u = new URL(String(url), location.href);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('openUrl allows http and https only');
  window.open(u.href, '_blank', 'noopener,noreferrer');
}

/** How an interpolated value reads: null is empty, objects are JSON. @param {unknown} v */
const str = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/**
 * "Hello ${/user/name}": paths, literals and calls like
 * ${formatNumber(value: /total, decimals: 2)}. \${ is a literal ${.
 * @param {Surface} s @param {string} text @param {Scope} scope
 */
function formatString(s, text, scope) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('\\${', i)) {
      out += '${';
      i += 3;
    } else if (text.startsWith('${', i)) {
      const end = closing(text, i + 2, '}');
      if (end < 0) return out + text.slice(i);
      out += str(expr(s, text.slice(i + 2, end).trim(), scope));
      i = end + 1;
    } else out += text[i++];
  }
  return out;
}

/** Index of the `close` that ends the run starting at i, skipping quotes and parentheses. @param {string} t @param {number} i @param {string} close */
function closing(t, i, close) {
  let depth = 0;
  for (/** @type {string | null} */ let q = null; i < t.length; i++) {
    const ch = t[i];
    if (q) q = ch === q ? null : q;
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    else if (ch === close && depth === 0) return i;
  }
  return -1;
}

/** @param {Surface} s @param {string} e @param {Scope} scope @returns {unknown} */
function expr(s, e, scope) {
  if (/^(["']).*\1$/s.test(e)) return e.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(e)) return Number(e);
  if (e === 'true' || e === 'false') return e === 'true';
  if (e === 'null') return null;
  const fn = /^(@?[A-Za-z_]\w*)\((.*)\)$/s.exec(e);
  if (!fn) return s.get(absolute(e, scope));
  /** @type {Record<string, unknown>} */
  const args = {};
  for (let rest = fn[2].trim(); rest; ) {
    const end = closing(rest, 0, ',');
    const part = end < 0 ? rest : rest.slice(0, end);
    const colon = part.indexOf(':');
    if (colon > 0) args[part.slice(0, colon).trim()] = expr(s, part.slice(colon + 1).trim(), scope);
    rest = end < 0 ? '' : rest.slice(end + 1).trim();
  }
  return call(s, fn[1], args, scope, false);
}

/**
 * The common TR35 tokens: yyyy yy MMMM MMM MM M dd d EEEE EEE HH H hh h mm ss a,
 * and 'quoted' literals. A bare date ("2026-11-23") is a local date.
 * @param {unknown} value @param {string} format
 */
function formatDate(value, format) {
  const day = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.exec(value);
  const d = day ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) : new Date(/** @type {any} */ (value));
  if (Number.isNaN(d.getTime())) return '';
  const name = (/** @type {Intl.DateTimeFormatOptions} */ o) => new Intl.DateTimeFormat(locale(), o).format(d);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const h = d.getHours();
  /** @type {Record<string, () => string | number>} */
  const tok = {
    yyyy: () => d.getFullYear(), yy: () => pad(d.getFullYear() % 100),
    MMMM: () => name({ month: 'long' }), MMM: () => name({ month: 'short' }), MM: () => pad(d.getMonth() + 1), M: () => d.getMonth() + 1,
    dd: () => pad(d.getDate()), d: () => d.getDate(), EEEE: () => name({ weekday: 'long' }), EEE: () => name({ weekday: 'short' }),
    HH: () => pad(h), H: () => h, hh: () => pad(h % 12 || 12), h: () => h % 12 || 12,
    mm: () => pad(d.getMinutes()), ss: () => pad(d.getSeconds()), a: () => (h < 12 ? 'AM' : 'PM'),
  };
  return format.replace(/'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|ss|a/g, (m, lit) => (lit !== undefined ? lit || "'" : String(tok[m]())));
}

// ---- drawing ------------------------------------------------------------------

/**
 * A media URL the guide allows: http(s) with a host, data:, or a same-host path.
 * Hosts that must not load from other hosts replace A2uiSurface.mediaUrl.
 * @param {unknown} v
 */
export function mediaUrl(v) {
  const u = String(v ?? '').replace(/^[\s\x00-\x1f]+|[\s\x00-\x1f]+$/g, '');
  const head = u.slice(0, 16).replace(/[\t\n\r]/g, '').replace(/\\/g, '/').toLowerCase();
  if (!u || head.startsWith('//')) return '';
  if (/^https?:\/\/[^/?#]/.test(head) || head.startsWith('data:')) return u;
  return /^[a-z][a-z0-9+.-]*:/.test(head) ? '' : u;
}

/** Text with the little Markdown the catalog allows: headings, lists, bold, italics, code. @param {string} text */
function markdown(text) {
  const inline = (/** @type {string} */ t) => String(html`${t}`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, '$1<em>$2</em>');
  let out = '';
  /** @type {string[]} */ let para = [];
  /** @type {string[]} */ let items = [];
  const flush = () => {
    if (para.length > 0) out += `<p>${para.map(inline).join('<br>')}</p>`;
    if (items.length > 0) out += `<ul>${items.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`;
    para = [];
    items = [];
  };
  for (const line of text.split('\n')) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (!line.trim() || h || (li ? para.length > 0 : items.length > 0)) flush();
    if (h) out += `<p class="h h${h[1].length}">${inline(h[2])}</p>`;
    else if (li) items.push(li[1]);
    else if (line.trim()) para.push(line);
  }
  flush();
  return raw(out);
}

/** name="value", or nothing when the value is empty. @param {string} name a literal @param {unknown} value */
const attr = (name, value) => (value == null || value === '' ? '' : html`${raw(name)}="${str(value)}"`);

const FLEX = { start: 'flex-start', center: 'center', end: 'flex-end', spaceBetween: 'space-between', spaceAround: 'space-around', spaceEvenly: 'space-evenly', stretch: 'stretch' };
const FIT = { contain: 'contain', cover: 'cover', fill: 'fill', none: 'none', scaleDown: 'scale-down' };
/** @param {Record<string, string>} table @param {unknown} key @param {string} fallback */
const pick = (table, key, fallback) => (typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : fallback);

/** What one draw needs: the model, the element's local state, and what clicks will find. */
class Draw {
  nodes = 0;
  /** @type {Map<string, { c: Component, scope: Scope }>} */
  actions = new Map();
  /** @param {Surface} s @param {A2uiSurface} el */
  constructor(s, el) {
    this.s = s;
    this.el = el;
  }

  /** @param {unknown} v @param {Scope} scope */
  val(v, scope) {
    return resolve(this.s, v, scope);
  }

  /**
   * @param {unknown} id @param {Scope} scope @param {number} depth @param {boolean} [weighted] a direct child of Row or Column
   * @returns {unknown}
   */
  node(id, scope, depth, weighted = false) {
    const c = typeof id === 'string' ? this.s.components.get(id) : undefined;
    if (!c) return html`<span class="missing" aria-busy="true"></span>`; // streaming: it may come later
    if (++this.nodes > MAX_NODES || depth > MAX_DEPTH) throw new Error('surface too large or too deep');
    const key = scope ? `${c.id}@${scope.base}` : c.id;
    const a11y = c['@accessibility'] ?? {};
    const label = this.val(a11y.label, scope);
    const weight = weighted && typeof c.weight === 'number' ? `flex: ${c.weight} 1 0` : '';
    /** @type {unknown} */
    const body = this[/** @type {'Tabs'} */ (c.component)](c, scope, depth, key);
    return html`<div class="c ${c.component}" style="${weight}" ${attr('aria-label', label)} ${attr('aria-hidden', a11y.hidden === true ? 'true' : '')}>${body}</div>`;
  }

  /** @param {any} list @param {Scope} scope @param {number} depth @param {boolean} weighted */
  children(list, scope, depth, weighted) {
    if (Array.isArray(list)) return list.map((id) => this.node(id, scope, depth + 1, weighted));
    if (!list || typeof list.path !== 'string') return [];
    const base = absolute(list.path, scope);
    const items = this.s.get(base);
    return Array.isArray(items) ? items.map((_, index) => this.node(list.componentId, { base: `${base}/${index}`, index }, depth + 1, weighted)) : [];
  }

  /** Failing @checks messages. @param {Component} c @param {Scope} scope */
  failing(c, scope) {
    const checks = Array.isArray(c['@checks']) ? c['@checks'] : [];
    return checks.filter((k) => !valid(this.val(k?.condition, scope))).map((k) => String(k?.message ?? 'Invalid'));
  }

  /** The bound pointer of an input, or a local key when the value is a literal. @param {unknown} v @param {Scope} scope @param {string} key */
  bind(v, scope, key) {
    const p = v && typeof v === 'object' && typeof (/** @type {any} */ (v)['@path']) === 'string' ? absolute(/** @type {any} */ (v)['@path'], scope) : '';
    const value = p ? this.s.get(p) : this.el.local.has(key) ? this.el.local.get(key) : this.val(v, scope);
    return { attrs: p ? html`data-bind="${p}"` : html`data-local="${key}"`, value };
  }

  /** The label, the control and the failing checks of an input. @param {Component} c @param {Scope} scope @param {string} key @param {unknown} control */
  field(c, scope, key, control) {
    const msgs = this.el.touched.has(key) ? this.failing(c, scope) : [];
    return html`<label class="field"><span class="label">${str(this.val(c.label, scope))}</span>${control}${msgs.map((m) => html`<span class="error" role="alert">${m}</span>`)}</label>`;
  }

  /** @param {Component} c @param {Scope} scope */
  Text(c, scope) {
    const variant = c.variant === 'caption' ? 'caption' : 'body';
    return html`<div class="text ${variant}">${markdown(str(this.val(c.text, scope)))}</div>`;
  }

  /** @param {Component} c @param {Scope} scope */
  Image(c, scope) {
    const src = A2uiSurface.mediaUrl(this.val(c.url, scope));
    const variant = pick({ icon: 'icon', avatar: 'avatar', smallFeature: 'small', mediumFeature: 'medium', largeFeature: 'large', header: 'header' }, c.variant, 'medium');
    return src && html`<img class="${variant}" src="${src}" alt="${str(this.val(c.description, scope))}" style="object-fit: ${pick(FIT, c.fit, 'fill')}" loading="lazy">`;
  }

  /** @param {Component} c @param {Scope} scope */
  Icon(c, scope) {
    const name = this.val(c.name, scope);
    if (typeof name === 'string') return icon(name, 24);
    const d = str(this.val(/** @type {any} */ (name)?.svgPath, scope));
    // A path is drawing commands and numbers only, so it can hold no markup.
    return /^[MmLlHhVvCcSsQqTtAaZz0-9\s,.eE+-]+$/.test(d) ? html`<svg class="icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>` : '';
  }

  /** @param {Component} c @param {Scope} scope */
  Video(c, scope) {
    const src = A2uiSurface.mediaUrl(this.val(c.url, scope));
    const poster = A2uiSurface.mediaUrl(this.val(c.posterUrl, scope));
    return src && html`<video controls preload="metadata" src="${src}" ${attr('poster', poster)}></video>`;
  }

  /** @param {Component} c @param {Scope} scope */
  AudioPlayer(c, scope) {
    const src = A2uiSurface.mediaUrl(this.val(c.url, scope));
    return src && html`<audio controls preload="metadata" src="${src}" ${attr('aria-label', this.val(c.description, scope))}></audio>`;
  }

  /** @param {Component} c @param {Scope} scope @param {number} depth */
  Row(c, scope, depth) {
    return html`<div class="row" style="justify-content: ${pick(FLEX, c.justify, 'flex-start')}; align-items: ${pick(FLEX, c.align, 'stretch')}">${this.children(c.children, scope, depth, true)}</div>`;
  }

  /** @param {Component} c @param {Scope} scope @param {number} depth */
  Column(c, scope, depth) {
    return html`<div class="column" style="justify-content: ${pick(FLEX, c.justify, 'flex-start')}; align-items: ${pick(FLEX, c.align, 'stretch')}">${this.children(c.children, scope, depth, true)}</div>`;
  }

  /** @param {Component} c @param {Scope} scope @param {number} depth */
  List(c, scope, depth) {
    const dir = c.direction === 'horizontal' ? 'horizontal' : 'vertical';
    return html`<div class="list ${dir}" role="list" style="align-items: ${pick(FLEX, c.align, 'stretch')}">${this.children(c.children, scope, depth, false).map((x) => html`<div role="listitem">${x}</div>`)}</div>`;
  }

  /** @param {Component} c @param {Scope} scope @param {number} depth */
  Card(c, scope, depth) {
    return html`<div class="card">${this.node(c.child, scope, depth + 1)}</div>`;
  }

  /** @param {Component} c @param {Scope} scope @param {number} depth @param {string} key @returns {unknown} */
  Tabs(c, scope, depth, key) {
    const tabs = Array.isArray(c.tabs) ? c.tabs : [];
    const sel = Math.min(this.el.tabs.get(key) ?? 0, tabs.length - 1);
    return html`<div role="tablist">${tabs.map((t, i) => html`<button type="button" role="tab" id="${key}-tab-${i}" aria-selected="${String(i === sel)}" aria-controls="${key}-panel" data-tab="${key}" data-index="${i}">${str(this.val(t?.title, scope))}</button>`)}</div>
      <div role="tabpanel" id="${key}-panel" aria-labelledby="${key}-tab-${sel}">${tabs.length > 0 && this.node(tabs[sel]?.child, scope, depth + 1)}</div>`;
  }

  /** @param {Component} c @param {Scope} scope @param {number} depth @param {string} key */
  Modal(c, scope, depth, key) {
    return html`<div class="trigger" data-modal="${key}">${this.node(c.trigger, scope, depth + 1)}</div>
      <dialog id="${key}-dialog" closedby="any"><div class="sheet"><form method="dialog" class="close"><button class="borderless" aria-label="Close">${icon('close')}</button></form>${this.node(c.content, scope, depth + 1)}</div></dialog>`;
  }

  /** @param {Component} c */
  Divider(c) {
    return html`<hr class="${c.axis === 'vertical' ? 'vertical' : 'horizontal'}">`;
  }

  /** @param {Component} c @param {Scope} scope @param {number} depth @param {string} key */
  Button(c, scope, depth, key) {
    this.actions.set(key, { c, scope });
    const msgs = this.failing(c, scope);
    const variant = pick({ default: 'default', primary: 'primary', borderless: 'borderless' }, c.variant, 'default');
    return html`<button type="button" class="${variant}" data-action="${key}" ${msgs.length > 0 ? 'disabled' : ''} ${attr('title', msgs.join('\n'))}>${this.node(c.child, scope, depth + 1)}</button>`;
  }

  /** @param {Component} c @param {Scope} scope @param {number} _depth @param {string} key */
  TextField(c, scope, _depth, key) {
    const { attrs, value } = this.bind(c.value, scope, key);
    const v = str(value);
    const ph = attr('placeholder', this.val(c.placeholder, scope));
    const invalid = this.el.touched.has(key) && this.failing(c, scope).length > 0;
    const type = pick({ shortText: 'text', number: 'number', obscured: 'password' }, c.variant, 'text');
    const control = c.variant === 'longText'
      ? html`<textarea id="${key}" ${attrs} ${ph} aria-invalid="${String(invalid)}">${v}</textarea>`
      : html`<input id="${key}" type="${type}" ${attrs} value="${v}" ${ph} aria-invalid="${String(invalid)}">`;
    return this.field(c, scope, key, control);
  }

  /** @param {Component} c @param {Scope} scope @param {number} _depth @param {string} key */
  CheckBox(c, scope, _depth, key) {
    const { attrs, value } = this.bind(c.value, scope, key);
    const msgs = this.el.touched.has(key) ? this.failing(c, scope) : [];
    return html`<label class="check"><input type="checkbox" id="${key}" ${attrs} ${valid(value) ? 'checked' : ''}><span>${str(this.val(c.label, scope))}</span></label>${msgs.map((m) => html`<span class="error" role="alert">${m}</span>`)}`;
  }

  /** @param {Component} c @param {Scope} scope @param {number} _depth @param {string} key */
  ChoicePicker(c, scope, _depth, key) {
    const { attrs, value } = this.bind(c.value, scope, key);
    const chosen = Array.isArray(value) ? value.map(String) : [];
    const multi = c.variant === 'multipleSelection';
    const filter = (this.el.filters.get(key) ?? '').toLowerCase();
    const options = (Array.isArray(c.options) ? c.options : [])
      .map((o) => ({ value: String(o?.value ?? ''), label: str(this.val(o?.label, scope)) }))
      .filter((o) => !filter || o.label.toLowerCase().includes(filter));
    const msgs = this.el.touched.has(key) ? this.failing(c, scope) : [];
    return html`<fieldset class="choices ${c.displayStyle === 'chips' ? 'chips' : ''}" data-choices="${key}" data-multi="${String(multi)}" ${attrs}>
      ${c.label !== undefined && html`<legend>${str(this.val(c.label, scope))}</legend>`}
      ${c.filterable === true && html`<input type="search" class="filter" data-filter="${key}" value="${this.el.filters.get(key) ?? ''}" aria-label="Filter">`}
      ${options.map((o) => html`<label class="choice"><input type="${multi ? 'checkbox' : 'radio'}" name="${key}" value="${o.value}" ${chosen.includes(o.value) ? 'checked' : ''}><span>${o.label}</span></label>`)}
      ${msgs.map((m) => html`<span class="error" role="alert">${m}</span>`)}</fieldset>`;
  }

  /** @param {Component} c @param {Scope} scope @param {number} _depth @param {string} key */
  Slider(c, scope, _depth, key) {
    const { attrs, value } = this.bind(c.value, scope, key);
    const min = typeof c.min === 'number' ? c.min : 0;
    const max = typeof c.max === 'number' ? c.max : 100;
    const step = Number.isInteger(c.steps) && c.steps > 0 ? (max - min) / c.steps : 'any';
    return this.field(c, scope, key, html`<span class="slider"><input type="range" id="${key}" ${attrs} min="${min}" max="${max}" step="${step}" value="${str(value)}"><output for="${key}">${str(value)}</output></span>`);
  }

  /** @param {Component} c @param {Scope} scope @param {number} _depth @param {string} key */
  DateTimeInput(c, scope, _depth, key) {
    const { attrs, value } = this.bind(c.value, scope, key);
    const kind = c.enableTime === true ? (c.enableDate === true ? 'datetime-local' : 'time') : 'date';
    // The input reads a local ISO form: 2026-11-23, 14:30, or 2026-11-23T14:30.
    const fit = (/** @type {unknown} */ v) => {
      const t = str(v);
      if (kind === 'date') return t.slice(0, 10);
      if (kind === 'time') return t.includes('T') ? t.slice(11, 16) : t.slice(0, 5);
      return t.slice(0, 16);
    };
    return this.field(c, scope, key, html`<input type="${kind}" id="${key}" ${attrs} value="${fit(value)}" ${attr('min', fit(this.val(c.min, scope)))} ${attr('max', fit(this.val(c.max, scope)))}>`);
  }
}

/**
 * <a2ui-surface>: one A2UI surface. data-source holds its messages; apply()
 * adds more. Fires `a2ui-action` with {version, action} when a button's event
 * action runs.
 */
export class A2uiSurface extends AurilElement {
  /** The stylesheets each shadow root links: the house styles, then the surface's own. Empty links none. */
  static css = [new URL('./base.css', import.meta.url).href, new URL('./a2ui.css', import.meta.url).href];
  /** Which media URL may load, or '' for none. Replace it to forbid other hosts. */
  static mediaUrl = mediaUrl;

  #s = new Surface();
  #error = '';
  #loaded = false;
  /** @type {HTMLElement | null} */
  #view = null;
  /** @type {Draw['actions']} */
  #actions = new Map();
  /** Local state that is not the agent's data: selected tab, picker filter, touched inputs, unbound values. */
  tabs = new Map();
  /** @type {Map<string, string>} */
  filters = new Map();
  touched = new Set();
  local = new Map();

  static observedAttributes = ['data-source'];

  /**
   * A new data-source is a new surface: a parent's morph may reuse this node
   * for another source in the same place.
   * @param {string} _name @param {string | null} old @param {string | null} now
   */
  attributeChangedCallback(_name, old, now) {
    if (!this.#loaded || old === now) return;
    this.#s = new Surface();
    this.#error = '';
    for (const m of [this.tabs, this.filters, this.touched, this.local]) m.clear();
    this.load(now ?? '');
  }

  /** The data model, for a host that sends it with an action. */
  get data() {
    return this.#s.data;
  }

  onConnect() {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: 'open' });
      const css = A2uiSurface.css.map((href) => `<link rel="stylesheet" href="${String(html`${href}`)}">`).join('');
      root.innerHTML = `${css}<div class="a2ui"></div>`;
    }
    const root = /** @type {ShadowRoot} */ (this.shadowRoot);
    this.#view = /** @type {HTMLElement} */ (root.lastElementChild);
    this.on(root, 'input', (e) => this.#input(/** @type {HTMLInputElement} */ (e.target)));
    this.on(root, 'change', (e) => this.#input(/** @type {HTMLInputElement} */ (e.target)));
    this.on(root, 'click', (e) => this.#click(e));
    if (!this.#loaded) {
      this.#loaded = true;
      if (this.dataset.source) this.load(this.dataset.source);
    }
    this.#draw();
  }

  /** Applies every message in a source. @param {string} text */
  load(text) {
    try {
      for (const m of parseMessages(text)) this.#s.apply(m);
    } catch (err) {
      this.#error = /** @type {Error} */ (err).message;
    }
    this.#draw();
  }

  /** Applies one message, for a surface that streams. @param {unknown} msg */
  apply(msg) {
    try {
      this.#s.apply(msg);
    } catch (err) {
      this.#error = /** @type {Error} */ (err).message;
    }
    this.#draw();
  }

  #draw() {
    if (!this.#view) return;
    let out;
    const d = new Draw(this.#s, this);
    try {
      out = this.#error
        ? html`<p class="failed" role="alert">${this.#error}</p>`
        : this.#s.components.has('root') ? d.node('root', null, 0) : '';
    } catch (err) {
      out = html`<p class="failed" role="alert">${/** @type {Error} */ (err).message}</p>`;
    }
    this.#actions = d.actions;
    morph(this.#view, out, {
      // An open dialog's `open` is the browser's state, not the markup's.
      callbacks: { beforeAttributeUpdated: (attr, el) => !(attr === 'open' && el.localName === 'dialog') },
    });
  }

  /** @param {HTMLInputElement} t */
  #input(t) {
    if (t.dataset.filter) {
      this.filters.set(t.dataset.filter, t.value);
      return this.#draw();
    }
    const set = /** @type {HTMLElement | null} */ (t.closest('[data-choices]'));
    const holder = set ?? t;
    const key = set?.dataset.choices ?? t.id;
    // A text field writes on input; checkboxes, radios and pickers on change.
    const toggles = t.type === 'checkbox' || t.type === 'radio';
    let value;
    if (set) {
      if (!toggles) return;
      const shown = [...set.querySelectorAll('input[name]')].map((i) => /** @type {HTMLInputElement} */ (i).value);
      const before = this.#read(holder).filter((/** @type {string} */ v) => !shown.includes(v)); // kept while filtered out
      const now = [...set.querySelectorAll('input[name]:checked')].map((i) => /** @type {HTMLInputElement} */ (i).value);
      value = set.dataset.multi === 'true' ? [...before, ...now] : now.slice(0, 1);
    } else if (t.type === 'checkbox') value = t.checked;
    else if (t.type === 'range') value = Number(t.value);
    else value = t.value;
    this.touched.add(key);
    if (holder.dataset.bind) this.#s.set(holder.dataset.bind, value);
    else this.local.set(holder.dataset.local, value);
    this.#draw();
  }

  /** @param {HTMLElement} holder */
  #read(holder) {
    const v = holder.dataset.bind ? this.#s.get(holder.dataset.bind) : this.local.get(holder.dataset.local);
    return Array.isArray(v) ? v.map(String) : [];
  }

  /** @param {Event} e */
  #click(e) {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.localName === 'dialog') return /** @type {HTMLDialogElement} */ (t).close(); // a click on the backdrop
    const tab = /** @type {HTMLElement | null} */ (t.closest('[data-tab]'));
    if (tab) {
      this.tabs.set(tab.dataset.tab, Number(tab.dataset.index));
      return this.#draw();
    }
    const modal = /** @type {HTMLElement | null} */ (t.closest('[data-modal]'));
    if (modal) {
      const dialog = /** @type {HTMLDialogElement | null} */ (this.shadowRoot?.getElementById(`${modal.dataset.modal}-dialog`) ?? null);
      return dialog?.showModal();
    }
    const button = /** @type {HTMLButtonElement | null} */ (t.closest('button[data-action]'));
    const hit = button && !button.disabled && this.#actions.get(/** @type {string} */ (button.dataset.action));
    if (!hit) return;
    const { c, scope } = hit;
    const { event, functionCall } = c.action ?? {};
    if (functionCall) return void resolve(this.#s, functionCall, scope, true);
    if (!event || typeof event.name !== 'string') return;
    /** @type {Record<string, unknown>} */
    const context = {};
    for (const [k, v] of Object.entries(event.context ?? {})) context[k] = resolve(this.#s, v, scope);
    const userMessage = event.userMessage === undefined ? undefined : str(resolve(this.#s, event.userMessage, scope));
    const action = { name: event.name, surfaceId: this.#s.id, sourceComponentId: c.id, timestamp: new Date().toISOString(), context, ...(userMessage ? { userMessage } : {}) };
    this.dispatchEvent(new CustomEvent('a2ui-action', { bubbles: true, detail: { version: '1.0', action } }));
  }
}

if (!customElements.get('a2ui-surface')) customElements.define('a2ui-surface', A2uiSurface);
