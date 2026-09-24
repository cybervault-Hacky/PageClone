/**
 * Capture engine constants — the single home for every allow-list and limit.
 * Widening any of these is a deliberate, reviewed change.
 */
import type { CaptureOptions } from '../types/capture';

/** Schema version produced by the current engine. */
export const CAPTURE_RESULT_VERSION = 1;

/**
 * Central computed-style property whitelist. Everything outside this list is
 * never read into the capture.
 */
export const STYLE_PROPERTY_WHITELIST: readonly string[] = [
  // Layout
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'box-sizing',
  'margin',
  'padding',
  // Flexbox
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'justify-content',
  'align-items',
  'align-content',
  'gap',
  // Grid
  'grid-template-columns',
  'grid-template-rows',
  'grid-column',
  'grid-row',
  // Typography
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
  'white-space',
  // Visual
  'color',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'border',
  'border-radius',
  'box-shadow',
  'opacity',
  'visibility',
  'overflow',
  // Effects
  'transform',
  'transform-origin',
  'filter',
  'backdrop-filter',
  'transition',
  'animation',
];

/**
 * Attributes that may be copied from the page. Notably ABSENT:
 * `value` (form data), `style` (raw inline CSS), every `on*` handler,
 * and any credential/authorization metadata.
 */
export const ALLOWED_ATTRIBUTES: readonly string[] = [
  'id',
  'class',
  'role',
  'aria-label',
  'aria-describedby',
  'aria-labelledby',
  'aria-hidden',
  'aria-expanded',
  'aria-checked',
  'aria-selected',
  'aria-disabled',
  'aria-current',
  'title',
  'href',
  'target',
  'rel',
  'alt',
  'name',
  'type',
  'placeholder',
  'disabled',
  'checked',
  'src',
  'srcset',
  'sizes',
  'media',
  'width',
  'height',
  'lang',
  'dir',
  'for',
  'colspan',
  'rowspan',
  'readonly',
  'multiple',
  'selected',
  'loading',
  'tabindex',
];

/** Tags whose content is never captured (source/executable/default values). */
export const TEXT_EXCLUDED_TAGS: readonly string[] = [
  'script',
  'style',
  'noscript',
  'template',
  // <textarea> content is the field's default VALUE — sensitive by policy.
  'textarea',
];

/** Tags that are structural-only and never descended into. */
export const SKIPPED_TAGS: readonly string[] = ['script', 'style', 'noscript', 'template'];

/** Form controls whose `value` attribute (if present) is always redacted. */
export const FORM_CONTROL_TAGS: readonly string[] = [
  'input',
  'textarea',
  'select',
  'option',
  'button',
];

export const INTERACTIVE_TAGS: readonly string[] = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'label',
];

/** Explicit computed-style subset captured for ::before / ::after. */
export const PSEUDO_STYLE_WHITELIST: readonly string[] = [
  'color',
  'background-color',
  'background-image',
  'content',
];

/** Defensive hard limits for a single capture run. */
export const CAPTURE_LIMITS = {
  maxElements: 5000,
  maxTextLength: 400,
  maxTotalText: 200_000,
  maxAssets: 500,
  maxDepth: 300,
  maxDurationMs: 6000,
  maxSerializedBytes: 5_000_000,
} as const;

/** Parsed style/attribute values longer than this are dropped. */
export const MAX_VALUE_LENGTH = 4096;

/** Background waits slightly longer than the engine's own duration limit. */
export const CAPTURE_TIMEOUT_MS = 8000;

/** Safe defaults applied when the popup sends no explicit options. */
export const DEFAULT_CAPTURE_OPTIONS: CaptureOptions = {
  includeText: true,
  includeStyles: true,
  includeImages: true,
  includeSvg: true,
  includeBackgroundImages: true,
  includeLinks: true,
  includePseudoElements: true,
  maxElements: CAPTURE_LIMITS.maxElements,
  maxTextLength: CAPTURE_LIMITS.maxTextLength,
  maxTotalText: CAPTURE_LIMITS.maxTotalText,
  maxAssets: CAPTURE_LIMITS.maxAssets,
};
