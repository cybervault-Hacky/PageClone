/**
 * Reconstruction output validation.
 *
 * The validator re-checks the generated document against the reconstruction
 * policy before anyone may render it (used by the popup preview and by the
 * regression suites). It relies on hard invariants of the renderer:
 *
 * - captured text/attributes are fully escaped, so any raw `<` in the HTML
 *   can only come from the renderer itself;
 * - raw `"` only occurs inside attribute values, so attribute scanning is
 *   exact (never fooled by text content);
 * - CSS is generated, never copied, so structural checks are meaningful.
 */
import {
  GLOBAL_ATTRIBUTES,
  RECONSTRUCTION_LIMITS,
  RECONSTRUCTION_RESULT_VERSION,
  TAG_ATTRIBUTES,
} from '@/shared/constants/reconstruct';
import { CSS_DENYLIST_SUBSTRINGS } from '@/shared/constants/reconstruct';
import type { ReconstructionResult, ReconstructionWarning } from '@/shared/types/reconstruct';

export type ReconstructionValidationOutcome =
  | { readonly ok: true; readonly result: ReconstructionResult }
  | { readonly ok: false; readonly code: 'RECONSTRUCTION_INVALID_RESULT' };

const WARNING_CODES: ReadonlySet<string> = new Set<string>([
  'UNSUPPORTED_ELEMENT',
  'UNSAFE_ELEMENT_REMOVED',
  'UNSAFE_ATTRIBUTE_OMITTED',
  'UNSAFE_URL_OMITTED',
  'STYLE_PROPERTY_OMITTED',
  'PSEUDO_ELEMENT_UNAVAILABLE',
  'EXTERNAL_ASSET_REFERENCE',
  'FORM_VALUE_OMITTED',
  'SVG_MARKUP_UNAVAILABLE',
  'HEAD_METADATA_SIMPLIFIED',
]);

const FORBIDDEN_RAW_TAGS = /<(script|iframe|object|embed|applet|frame|frameset|portal|math)\b/i;

const ATTR_PATTERN = /\s([a-zA-Z][a-zA-Z0-9-]*)="([^"]*)"/g;

const UNSAFE_VALUE_PREFIX = /^(?:javascript|vbscript|data:text)/i;

function attributeUniverse(): ReadonlySet<string> {
  const names = new Set<string>(GLOBAL_ATTRIBUTES);
  for (const list of Object.values(TAG_ATTRIBUTES)) {
    for (const name of list) names.add(name);
  }
  // The document assembler's own head vocabulary (never reconstructed from
  // captured attributes — those have no 'charset'/'content' in policy).
  names.add('charset');
  names.add('content');
  return names;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function fail(): ReconstructionValidationOutcome {
  return { ok: false, code: 'RECONSTRUCTION_INVALID_RESULT' };
}

/** Matches `<svg …>…</svg>` and self-closing `<svg …/>` regions. */
const SVG_REGION_PATTERN = /<svg\b[^>]*(?:\/>|>[\s\S]*?<\/svg>)/gi;

/**
 * Inline SVG regions are reconstructed from sanitized asset markup and keep
 * their SVG attribute vocabulary (xmlns, viewBox, path data, …). They are
 * scanned for handler/URL safety, not against the HTML attribute universe.
 */
function validateSvgRegions(html: string): boolean {
  SVG_REGION_PATTERN.lastIndex = 0;
  for (
    let match = SVG_REGION_PATTERN.exec(html);
    match !== null;
    match = SVG_REGION_PATTERN.exec(html)
  ) {
    const region = match[0];
    if (/\son[a-z]+\s*=/i.test(region)) return false;
    if (UNSAFE_VALUE_PREFIX.test(region)) return false;
    if (FORBIDDEN_RAW_TAGS.test(region)) return false;
  }
  SVG_REGION_PATTERN.lastIndex = 0;
  return true;
}

function validateHtml(html: string, allowedAttributes: ReadonlySet<string>): boolean {
  if (!html.startsWith('<!doctype html>')) return false;
  if (FORBIDDEN_RAW_TAGS.test(html)) return false;
  if (!validateSvgRegions(html)) return false;

  // Attribute-universe scanning applies to the HTML the renderer emits;
  // sanitized inline-SVG regions carry their own vocabulary.
  const htmlWithoutSvg = html.replace(SVG_REGION_PATTERN, '');
  ATTR_PATTERN.lastIndex = 0;
  for (
    let match = ATTR_PATTERN.exec(htmlWithoutSvg);
    match !== null;
    match = ATTR_PATTERN.exec(htmlWithoutSvg)
  ) {
    const name = match[1] ?? '';
    const value = match[2] ?? '';
    if (!allowedAttributes.has(name)) return false;
    if (name.toLowerCase().startsWith('on')) return false;
    if (UNSAFE_VALUE_PREFIX.test(value)) return false;
  }
  ATTR_PATTERN.lastIndex = 0;
  return true;
}

function validateCss(css: string): boolean {
  if (css === '') return true;
  if (css.includes('<')) return false;
  let open = 0;
  for (const char of css) {
    if (char === '{') open += 1;
    if (char === '}') open -= 1;
    if (open < 0) return false;
  }
  if (open !== 0) return false;
  const folded = css.toLowerCase();
  return !CSS_DENYLIST_SUBSTRINGS.some((needle) => folded.includes(needle));
}

function validateWarnings(value: unknown): value is ReconstructionWarning[] {
  if (!Array.isArray(value)) return false;
  for (const warning of value) {
    if (!isPlainObject(warning)) return false;
    if (typeof warning.code !== 'string' || !WARNING_CODES.has(warning.code)) return false;
    if (typeof warning.message !== 'string' || warning.message === '') return false;
    if (!isFiniteNonNegativeInteger(warning.count) || warning.count === 0) return false;
  }
  return true;
}

/**
 * Validates an untrusted value as a ReconstructionResult. Rejects malformed
 * schemas, structural security violations and inconsistent statistics.
 */
export function validateReconstructionResult(value: unknown): ReconstructionValidationOutcome {
  if (!isPlainObject(value)) return fail();
  if (value.version !== RECONSTRUCTION_RESULT_VERSION) return fail();

  const html = value.html;
  const css = value.css;
  if (typeof html !== 'string' || html === '') return fail();
  if (typeof css !== 'string') return fail();
  if (utf8ByteLength(html) > RECONSTRUCTION_LIMITS.maxHtmlBytes) return fail();
  if (utf8ByteLength(css) > RECONSTRUCTION_LIMITS.maxCssBytes) return fail();
  if (!validateHtml(html, attributeUniverse())) return fail();
  if (!validateCss(css)) return fail();

  const statistics = value.statistics;
  if (!isPlainObject(statistics)) return fail();
  for (const key of [
    'nodesReconstructed',
    'nodesSkipped',
    'elementsUnwrapped',
    'textNodesReconstructed',
    'attributesReconstructed',
    'stylesReconstructed',
    'styleRules',
    'pseudoElementsReconstructed',
    'svgInlineReconstructed',
    'warnings',
    'htmlBytes',
    'cssBytes',
  ] as const) {
    if (!isFiniteNonNegativeInteger(statistics[key])) return fail();
  }
  const nodesReconstructed = statistics.nodesReconstructed;
  const nodesSkipped = statistics.nodesSkipped;
  if (
    !isFiniteNonNegativeInteger(nodesReconstructed) ||
    !isFiniteNonNegativeInteger(nodesSkipped) ||
    nodesReconstructed + nodesSkipped === 0
  ) {
    return fail();
  }
  if (statistics.htmlBytes !== utf8ByteLength(html)) return fail();
  if (statistics.cssBytes !== utf8ByteLength(css)) return fail();

  if (!validateWarnings(value.warnings)) return fail();
  if (statistics.warnings !== value.warnings.length) return fail();

  try {
    if (JSON.stringify(value) === undefined) return fail();
  } catch {
    return fail();
  }

  return { ok: true, result: value as unknown as ReconstructionResult };
}
