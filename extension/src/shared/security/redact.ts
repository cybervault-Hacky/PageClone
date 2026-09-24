/**
 * Security boundary between raw DOM inspection and the normalized
 * CaptureResult. ALL raw data from the page passes through this module
 * before it can enter a capture result.
 *
 * Invariants (regression-tested):
 * - form field values are never captured (`value` is not allow-listed)
 * - event-handler attributes are never captured
 * - text is normalized and bounded
 * - SVG markup is stripped of scripts, event handlers and unsafe URLs
 * - cookies / web storage / IndexedDB are never touched by the engine
 */
import { ALLOWED_ATTRIBUTES, MAX_VALUE_LENGTH } from '../constants/capture';
import type { CaptureSecuritySummary } from '../types/capture';
import { resolveSafeResourceUrl } from '../utils/url';

export interface SecurityCounters {
  formValuesOmitted: number;
  passwordFieldsOmitted: number;
  eventHandlerAttributesDropped: number;
  unsafeUrlsSanitized: number;
  svgScriptsRemoved: number;
}

export function createSecurityCounters(): SecurityCounters {
  return {
    formValuesOmitted: 0,
    passwordFieldsOmitted: 0,
    eventHandlerAttributesDropped: 0,
    unsafeUrlsSanitized: 0,
    svgScriptsRemoved: 0,
  };
}

export function toSecuritySummary(counters: SecurityCounters): CaptureSecuritySummary {
  return {
    formValuesOmitted: counters.formValuesOmitted,
    passwordFieldsOmitted: counters.passwordFieldsOmitted,
    eventHandlerAttributesDropped: counters.eventHandlerAttributesDropped,
    unsafeUrlsSanitized: counters.unsafeUrlsSanitized,
    svgScriptsRemoved: counters.svgScriptsRemoved,
    cookiesAccessed: false,
    storageAccessed: false,
  };
}

/** Attributes whose values are only meaningful as absolute URLs. */
const URL_ATTRIBUTES = new Set(['href', 'src']);

/**
 * Filters a raw attribute list down to the allow-list, redacting form values
 * and unsafe URL schemes. `rawAttributes` is an iterable of [name, value].
 */
export function sanitizeAttributes(
  _tagName: string,
  rawAttributes: Iterable<readonly [string, string]>,
  counters: SecurityCounters,
  baseHref: string,
): Record<string, string> {
  const allowed = new Set(ALLOWED_ATTRIBUTES);
  const output: Record<string, string> = {};

  for (const [rawName, rawValue] of rawAttributes) {
    const name = rawName.toLowerCase();

    // Event handlers are never captured — counted for the security summary.
    if (name.startsWith('on')) {
      counters.eventHandlerAttributesDropped += 1;
      continue;
    }

    // Form field values are never captured, on any element.
    if (name === 'value') {
      counters.formValuesOmitted += 1;
      continue;
    }

    if (!allowed.has(name)) continue;

    let value = rawValue;

    if (URL_ATTRIBUTES.has(name)) {
      const safe = resolveSafeResourceUrl(rawValue, baseHref);
      if (safe === null) {
        counters.unsafeUrlsSanitized += 1;
        continue;
      }
      value = safe;
    }

    if (value.length > MAX_VALUE_LENGTH) {
      counters.unsafeUrlsSanitized += 1;
      continue;
    }

    output[name] = value;
  }

  return output;
}

/** Records that a password field was seen (its value is never read). */
export function countPasswordField(
  tagName: string,
  attributes: Record<string, string>,
  counters: SecurityCounters,
): void {
  if (tagName === 'input' && attributes.type === 'password') {
    counters.passwordFieldsOmitted += 1;
  }
}

/** Collapses whitespace, trims, and enforces a hard character bound. */
export function normalizeText(raw: string, maxLength: number): string {
  if (maxLength <= 0) return '';
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLength ? collapsed.slice(0, maxLength) : collapsed;
}

/** Truncates a single style/attribute value; null when unusable. */
export function clampValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value === '') return null;
  if (value.length > MAX_VALUE_LENGTH) return null;
  return value;
}

function isSvgUrlSafe(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return true;
  if (trimmed.startsWith('data:image/')) return true;
  try {
    const parsed = new URL(trimmed, 'https://pageclone.invalid/');
    return (
      parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'blob:'
    );
  } catch {
    return false;
  }
}

const SVG_UNSAFE_ELEMENTS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed']);

export interface SvgSanitization {
  readonly markup: string | null;
  readonly scriptsRemoved: number;
  readonly eventHandlerAttributesDropped: number;
  readonly unsafeUrlsSanitized: number;
}

/**
 * Produces a sanitized copy of inline SVG markup: removes scripts,
 * foreign-content elements, every event-handler attribute and unsafe URLs.
 * Returns null when the markup cannot be parsed or is oversized.
 */
export function sanitizeSvgMarkup(rawMarkup: string): SvgSanitization {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(rawMarkup, 'image/svg+xml');
  } catch {
    return {
      markup: null,
      scriptsRemoved: 0,
      eventHandlerAttributesDropped: 0,
      unsafeUrlsSanitized: 0,
    };
  }

  const root = doc.documentElement;
  if (root === null || (root.localName ?? root.nodeName).toLowerCase() === 'parsererror') {
    return {
      markup: null,
      scriptsRemoved: 0,
      eventHandlerAttributesDropped: 0,
      unsafeUrlsSanitized: 0,
    };
  }
  if (doc.querySelector('parsererror') !== null) {
    return {
      markup: null,
      scriptsRemoved: 0,
      eventHandlerAttributesDropped: 0,
      unsafeUrlsSanitized: 0,
    };
  }

  let scriptsRemoved = 0;
  let handlersDropped = 0;
  let urlsSanitized = 0;

  const all = Array.from(doc.querySelectorAll('*'));
  for (const element of all) {
    const local = (element.localName ?? element.nodeName).toLowerCase();
    if (SVG_UNSAFE_ELEMENTS.has(local)) {
      element.remove();
      if (local === 'script') scriptsRemoved += 1;
      continue;
    }

    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        element.removeAttribute(attr.name);
        handlersDropped += 1;
        continue;
      }
      if (
        (name === 'href' || name === 'xlink:href' || name === 'src') &&
        !isSvgUrlSafe(attr.value)
      ) {
        element.removeAttribute(attr.name);
        urlsSanitized += 1;
      }
    }
  }

  if (doc.documentElement === null) {
    return {
      markup: null,
      scriptsRemoved,
      eventHandlerAttributesDropped: handlersDropped,
      unsafeUrlsSanitized: urlsSanitized,
    };
  }

  const serialized = new XMLSerializer().serializeToString(doc.documentElement);
  if (serialized.length > MAX_VALUE_LENGTH * 4) {
    return {
      markup: null,
      scriptsRemoved,
      eventHandlerAttributesDropped: handlersDropped,
      unsafeUrlsSanitized: urlsSanitized,
    };
  }

  return {
    markup: serialized,
    scriptsRemoved,
    eventHandlerAttributesDropped: handlersDropped,
    unsafeUrlsSanitized: urlsSanitized,
  };
}
