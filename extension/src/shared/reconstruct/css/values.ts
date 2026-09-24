/**
 * CSS value sanitization.
 *
 * Captured style values are untrusted input. Every emitted declaration is
 * re-serialized through this module so a captured value can never break out
 * of a declaration, inject arbitrary CSS, or smuggle an executable URL.
 *
 * Guarantees for any value returned as `ok`:
 * - no `{`, `}`, `;`, `<`, `>`, backslash or control characters;
 * - every `url(…)` layer is an absolute http(s)/data:image/fragment URL,
 *   re-quoted and free of quote/parenthesis breakout characters;
 * - `content` is a single CSS string (or none) — never markup, never
 *   `attr()`/`counter()`/`url()` forms;
 * - denylisted constructs (`expression(`, `javascript:` …) are rejected.
 */
import { CSS_DENYLIST_SUBSTRINGS } from '@/shared/constants/reconstruct';
import { MAX_VALUE_LENGTH } from '@/shared/constants/capture';
import { extractCssUrl, resolveSafeResourceUrl } from '@/shared/utils/url';

export type SanitizedCssValue =
  { readonly ok: true; readonly value: string } | { readonly ok: false };

// Control characters can never be part of a legitimate CSS value and would
// make renderer output environment-dependent — reject them explicitly.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARACTERS = /[{};<>\\]|[\u0000-\u001f\u007f]/;

/** A computed `content` value must be exactly one double-quoted CSS string. */
const CONTENT_STRING_PATTERN = /^"(?:[^"\\\n\r]|\\[\s\S])*"$/;

const URL_TOKEN_PATTERN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/gi;

function containsDenylistedConstruct(value: string): boolean {
  const folded = value.toLowerCase();
  return CSS_DENYLIST_SUBSTRINGS.some((needle) => folded.includes(needle));
}

/** Re-serializes every url() layer as a quoted, scheme-checked URL. */
function rebuildUrlLayers(value: string, pageUrl: string): string | null {
  let rebuilt = '';
  let lastIndex = 0;
  let foundUrl = false;

  URL_TOKEN_PATTERN.lastIndex = 0;
  for (
    let match = URL_TOKEN_PATTERN.exec(value);
    match !== null;
    match = URL_TOKEN_PATTERN.exec(value)
  ) {
    foundUrl = true;
    rebuilt += value.slice(lastIndex, match.index);
    const inner = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    const resolved = resolveSafeResourceUrl(inner, pageUrl);
    if (resolved === null) return null;
    if (resolved.includes('"') || resolved.includes('\\') || resolved.includes('<')) return null;
    rebuilt += `url("${resolved}")`;
    lastIndex = match.index + match[0].length;
  }

  if (!foundUrl) return value;
  rebuilt += value.slice(lastIndex);
  return rebuilt;
}

/**
 * Sanitizes one captured style value for `property`.
 * `pageUrl` resolves possibly-relative captured URLs deterministically.
 */
export function sanitizeCssValue(
  property: string,
  rawValue: string,
  pageUrl: string,
): SanitizedCssValue {
  const value = rawValue.trim();
  if (value === '') return { ok: false };
  if (value.length > MAX_VALUE_LENGTH) return { ok: false };

  // `content` is handled before the generic character policy: CSS string
  // escapes (\", unicode) are legal there and cannot break out of the CSS
  // string. Raw angle brackets stay forbidden — the stylesheet is embedded
  // in a <style> element, so "</style>" must never be expressible.
  if (property === 'content') {
    if (!CONTENT_STRING_PATTERN.test(value)) return { ok: false };
    if (/['<>]/.test(value)) return { ok: false };
    return { ok: true, value };
  }

  if (containsDenylistedConstruct(value)) return { ok: false };
  if (FORBIDDEN_CHARACTERS.test(value)) return { ok: false };

  const rebuilt = rebuildUrlLayers(value, pageUrl);
  if (rebuilt === null) return { ok: false };
  return { ok: true, value: rebuilt };
}

/** Extracts the first `url(…)` target of a value, if any (for accounting). */
export function firstCssUrl(value: string): string | null {
  return extractCssUrl(value);
}
