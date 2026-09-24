/**
 * Reconstruction engine constants (Phase 3) — the explicit, reviewed policy
 * for what a reconstructed document may contain. Everything outside these
 * lists is omitted (with a warning), never guessed.
 *
 * This layer sits *behind* the Phase 2 capture boundary: it re-validates the
 * capture it receives and can only ever narrow, never widen, what may be
 * emitted.
 */
import type { ReconstructionOptions } from '../types/reconstruct';

/** Schema version produced by the current reconstruction engine. */
export const RECONSTRUCTION_RESULT_VERSION = 1;

/** Prefix of every generated class (`pc-n<nodeId>`); deterministic by design. */
export const GENERATED_CLASS_PREFIX = 'pc-n';

/** Deterministic generated class for a captured node id. */
export function generatedClassName(nodeId: number): string {
  return `${GENERATED_CLASS_PREFIX}${nodeId}`;
}

/**
 * Elements the reconstruction may emit as-is. Head-only elements are handled
 * by the document assembler instead (title/meta/link are rebuilt minimally
 * from page metadata). Inline `<svg>` is reconstructed from the sanitized
 * asset markup, never from captured children.
 */
export const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  // Document shells (rendered by the assembler)
  'html',
  'head',
  'body',
  // Sectioning / flow
  'main',
  'header',
  'footer',
  'nav',
  'section',
  'article',
  'aside',
  'div',
  'span',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'hr',
  'br',
  'address',
  // Inline text
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'small',
  'mark',
  'code',
  'time',
  'sub',
  'sup',
  // Links & interactivity (structural only — no behavior is reconstructed)
  'a',
  'button',
  'label',
  'details',
  'summary',
  // Media
  'img',
  'picture',
  'source',
  'figure',
  'figcaption',
  'video',
  'audio',
  'track',
  // Lists
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  // Forms (structural only — values are never reconstructed)
  'form',
  'fieldset',
  'legend',
  'input',
  'textarea',
  'select',
  'option',
  'optgroup',
  // Tables
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'caption',
  'colgroup',
  'col',
]);

/**
 * Elements that are dropped entirely (with their captured children) if they
 * ever reach the reconstruction layer. The Phase 2 capture already refuses
 * to record these; this list is defense in depth.
 */
export const DANGEROUS_TAGS: ReadonlySet<string> = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'applet',
  'frame',
  'frameset',
  'noscript',
  'template',
  'portal',
  'math',
]);

/** Empty elements rendered without a closing tag. */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'img',
  'source',
  'input',
  'br',
  'hr',
  'col',
  'track',
]);

/**
 * Elements whose captured text is never emitted even if present (their text
 * content is the field's VALUE — sensitive by the same policy as Phase 2).
 */
export const TEXT_SUPPRESSED_TAGS: ReadonlySet<string> = new Set(['textarea']);

/**
 * Elements rendered without padding newlines even inside block contexts,
 * because whitespace around them is visually significant or they are
 * table-internal.
 */
const NO_BREAK_TAGS: ReadonlySet<string> = new Set([
  'img',
  'source',
  'track',
  'col',
  'colgroup',
  'caption',
  'td',
  'th',
  'tr',
  'thead',
  'tbody',
  'tfoot',
  'legend',
  'option',
  'optgroup',
  'input',
  'select',
]);

/** Fallback block-level classification for nodes without captured display. */
const BLOCKISH_TAGS: ReadonlySet<string> = new Set([
  'html',
  'head',
  'body',
  'address',
  'article',
  'aside',
  'blockquote',
  'caption',
  'details',
  'dd',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hr',
  'html',
  'legend',
  'li',
  'main',
  'nav',
  'ol',
  'option',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

/** Display values that establish/continue block-level formatting. */
export const BLOCKISH_DISPLAY: ReadonlySet<string> = new Set([
  'block',
  'flex',
  'grid',
  'flow-root',
  'flow',
  'list-item',
  'table',
  'table-row',
  'table-cell',
  'table-caption',
  'table-row-group',
  'table-header-group',
  'table-footer-group',
  'table-column-group',
  'table-column',
]);

/**
 * Whether a newline may be inserted before this element inside a blockish
 * parent without changing rendering (whitespace between block-level boxes
 * collapses away; whitespace around inline boxes does not).
 */
export function isBlockishNode(tagName: string, display: string | undefined): boolean {
  if (NO_BREAK_TAGS.has(tagName)) return false;
  if (display !== undefined && display !== '') {
    return BLOCKISH_DISPLAY.has(display);
  }
  return BLOCKISH_TAGS.has(tagName);
}

/** Attributes safe on every element (the Phase 2 allow-list, narrowed). */
export const GLOBAL_ATTRIBUTES: readonly string[] = [
  'id',
  'class',
  'role',
  'title',
  'tabindex',
  'lang',
  'dir',
  'aria-label',
  'aria-describedby',
  'aria-labelledby',
  'aria-hidden',
  'aria-expanded',
  'aria-checked',
  'aria-selected',
  'aria-disabled',
  'aria-current',
];

/** Tag-specific attributes that may be reconstructed. */
export const TAG_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'loading'],
  source: ['src', 'media'],
  video: ['src', 'width', 'height'],
  audio: ['src'],
  track: ['src'],
  input: [
    'name',
    'type',
    'placeholder',
    'disabled',
    'checked',
    'readonly',
    'multiple',
    'width',
    'height',
    'alt',
  ],
  textarea: ['name', 'placeholder', 'disabled', 'readonly'],
  select: ['name', 'disabled', 'multiple'],
  option: ['disabled', 'selected'],
  optgroup: ['disabled'],
  button: ['name', 'type', 'disabled'],
  form: ['name'],
  fieldset: ['disabled'],
  label: ['for'],
  output: ['for'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  ol: ['type'],
};

/** Attributes emitted as bare presence markers (`disabled=""`). */
export const BOOLEAN_ATTRIBUTES: ReadonlySet<string> = new Set([
  'disabled',
  'checked',
  'selected',
  'readonly',
  'multiple',
]);

/** Canonical attribute emission order (deterministic output). */
export const ATTRIBUTE_ORDER: readonly string[] = [
  'id',
  'class',
  'role',
  'title',
  'lang',
  'dir',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-hidden',
  'aria-expanded',
  'aria-checked',
  'aria-selected',
  'aria-disabled',
  'aria-current',
  'href',
  'target',
  'rel',
  'src',
  'alt',
  'width',
  'height',
  'loading',
  'media',
  'name',
  'type',
  'placeholder',
  'for',
  'colspan',
  'rowspan',
  'tabindex',
  'disabled',
  'checked',
  'selected',
  'readonly',
  'multiple',
];

/** Elements allowed to carry a URL-bearing `src` attribute. */
export const SRC_TAGS: ReadonlySet<string> = new Set(['img', 'source', 'video', 'audio', 'track']);

/** Elements allowed to carry `href` (links are structural, never executed). */
export const HREF_TAGS: ReadonlySet<string> = new Set(['a']);

/**
 * No-op ("initial") captured values that are omitted to keep the generated
 * stylesheet bounded. Only values are listed where the browser default equals
 * the CSS initial value, so omitting can never change rendering. Margin,
 * padding, typography sizes and colors are always emitted when captured.
 */
export const CSS_NOOP_VALUES: Readonly<Record<string, ReadonlySet<string>>> = {
  position: new Set(['static']),
  top: new Set(['auto']),
  right: new Set(['auto']),
  bottom: new Set(['auto']),
  left: new Set(['auto']),
  width: new Set(['auto']),
  height: new Set(['auto']),
  'min-width': new Set(['auto', '0px']),
  'max-width': new Set(['auto', 'none']),
  'min-height': new Set(['auto', '0px']),
  'max-height': new Set(['auto', 'none']),
  'box-sizing': new Set(['content-box']),
  'flex-direction': new Set(['row']),
  'flex-wrap': new Set(['nowrap']),
  'flex-grow': new Set(['0']),
  'flex-shrink': new Set(['1']),
  'flex-basis': new Set(['auto']),
  'justify-content': new Set(['normal']),
  'align-items': new Set(['normal']),
  'align-content': new Set(['normal']),
  'grid-template-columns': new Set(['none']),
  'grid-template-rows': new Set(['none']),
  'font-weight': new Set(['400']),
  'line-height': new Set(['normal']),
  'letter-spacing': new Set(['normal']),
  'text-align': new Set(['start']),
  'text-transform': new Set(['none']),
  'white-space': new Set(['normal']),
  'background-image': new Set(['none']),
  'background-size': new Set(['auto']),
  'background-position': new Set(['0% 0%']),
  'background-repeat': new Set(['repeat']),
  'background-color': new Set(['rgba(0, 0, 0, 0)', 'transparent']),
  'border-radius': new Set(['0px']),
  'box-shadow': new Set(['none']),
  opacity: new Set(['1']),
  visibility: new Set(['visible']),
  overflow: new Set(['visible']),
  transform: new Set(['none']),
  filter: new Set(['none']),
  'backdrop-filter': new Set(['none']),
};

/** Properties whose computed value can start with a fixed no-op prefix. */
export const CSS_NOOP_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  transition: ['all 0s ease 0s'],
  animation: ['none 0s ease 0s 1 normal none running'],
  // Computed border shorthand of any unbordered element (color = currentColor).
  border: ['0px none '],
};

/** Substrings that must never appear inside an emitted CSS value. */
export const CSS_DENYLIST_SUBSTRINGS: readonly string[] = [
  'expression(',
  'javascript:',
  'vbscript:',
  '-moz-binding',
  'behavior:',
  '@import',
  '@charset',
];

/** Tags whose captured styles drive html/body element rules. */
export const SHELL_TAGS: ReadonlySet<string> = new Set(['html', 'body']);

/** html/body viewport-derived dimensions are never pinned (Phase 3 rule). */
const VIEWPORT_DIMENSION_PROPERTIES: ReadonlySet<string> = new Set([
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
]);

export function isViewportDimensionProperty(property: string): boolean {
  return VIEWPORT_DIMENSION_PROPERTIES.has(property);
}

/** `lang`/`dir` attribute values must be plain, bounded language tags. */
export const LANGUAGE_ATTRIBUTE_PATTERN = /^[A-Za-z0-9-]{1,35}$/;

/** Hard output bounds used by reconstruction validation. */
export const RECONSTRUCTION_LIMITS = {
  maxHtmlBytes: 24_000_000,
  maxCssBytes: 12_000_000,
} as const;

/** Safe defaults applied when the caller sends no explicit options. */
export const DEFAULT_RECONSTRUCTION_OPTIONS: ReconstructionOptions = {
  includeStyles: true,
  includePseudoElements: true,
  includeImages: true,
  includeLinks: true,
  includeOriginalClasses: true,
  includeFavicon: true,
};
