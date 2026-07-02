import { Idiomorph } from './vendor/idiomorph.js';

/**
 * Morph target's children to match an HTML string (or auril.js html`` result).
 * Non-destructive: preserves focus, selection, scroll and node identity.
 * The focused element's value is never overwritten (ignoreActiveValue), so
 * typing into an input that re-renders on keystroke is safe; morph resyncs
 * the value once the input blurs.
 * Give list items stable `id` attributes so reorders pair up correctly.
 * Exempt nodes (e.g. contenteditable) via options.callbacks.beforeNodeMorphed.
 * @param {Element} target
 * @param {unknown} content
 * @param {Record<string, unknown>} [options]
 */
export function morph(target, content, options = {}) {
  /** @type {any} */ (Idiomorph).morph(target, String(content), { morphStyle: 'innerHTML', ignoreActiveValue: true, ...options });
}
