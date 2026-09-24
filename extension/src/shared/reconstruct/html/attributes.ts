/**
 * Safe attribute reconstruction.
 *
 * Only attributes from the explicit per-tag policy are emitted; URL-bearing
 * attributes are re-validated with the Phase 2 URL utilities (captured URLs
 * are already sanitized — re-checking is defense in depth, never a
 * weakening). Everything else is omitted and counted as a warning.
 */
import {
  ATTRIBUTE_ORDER,
  BOOLEAN_ATTRIBUTES,
  GLOBAL_ATTRIBUTES,
  HREF_TAGS,
  SRC_TAGS,
  TAG_ATTRIBUTES,
} from '@/shared/constants/reconstruct';
import type { ReconstructionOptions } from '@/shared/types/reconstruct';
import type { CapturedNode } from '@/shared/types/capture';
import { resolveSafeResourceUrl } from '@/shared/utils/url';
import { escapeHtml } from './escape';
import type { ReconstructionState } from '../state';

function allowedForTag(tagName: string): ReadonlySet<string> {
  const specific = TAG_ATTRIBUTES[tagName] ?? [];
  return new Set([...GLOBAL_ATTRIBUTES, ...specific]);
}

function serializeAttribute(name: string, value: string): string {
  const serializedValue = BOOLEAN_ATTRIBUTES.has(name) && value === '' ? '' : escapeHtml(value);
  return ` ${name}="${serializedValue}"`;
}

function isExternalReference(url: string): boolean {
  return url.startsWith('https:') || url.startsWith('http:');
}

export interface AttributeRenderResult {
  readonly html: string;
  readonly emitted: number;
}

/**
 * Renders the reconstructed attribute list for one captured node.
 * `generatedClass` (from the CSS pass) is appended to the original class
 * token list so markup and stylesheet stay synchronized.
 */
export function renderAttributes(
  node: CapturedNode,
  generatedClass: string | null,
  pageUrl: string,
  options: ReconstructionOptions,
  state: ReconstructionState,
): AttributeRenderResult {
  const allowed = allowedForTag(node.tagName);
  const emitted = new Map<string, string>();
  let omitted = 0;

  // A safe href is the precondition for navigation attributes on anchors.
  let hrefEmitted = false;
  if (node.tagName === 'a' && HREF_TAGS.has('a') && options.includeLinks) {
    const rawHref = node.attributes.href;
    if (rawHref !== undefined) {
      const safe = resolveSafeResourceUrl(rawHref, pageUrl);
      if (safe === null) {
        state.warn('UNSAFE_URL_OMITTED');
      } else {
        if (isExternalReference(safe)) state.counters.externalAssetReferences += 1;
        emitted.set('href', safe);
        hrefEmitted = true;
      }
    }
  }

  const imageSrcAllowed = options.includeImages || !SRC_TAGS.has(node.tagName);

  for (const [name, rawValue] of Object.entries(node.attributes)) {
    if (name === 'class') continue; // merged separately below
    if (!allowed.has(name)) {
      omitted += 1;
      continue;
    }
    if (name === 'href') continue; // handled above
    if (name === 'target' || name === 'rel') {
      // Navigation attributes only exist alongside a reconstructed href.
      if (node.tagName === 'a' && hrefEmitted) emitted.set(name, rawValue);
      continue;
    }
    if (name === 'src') {
      if (!imageSrcAllowed) continue; // disabled by options — not a warning
      const safe = resolveSafeResourceUrl(rawValue, pageUrl);
      if (safe === null) {
        state.warn('UNSAFE_URL_OMITTED');
        continue;
      }
      if (isExternalReference(safe)) state.counters.externalAssetReferences += 1;
      emitted.set('src', safe);
      continue;
    }
    emitted.set(name, rawValue);
  }

  // Everything captured but not reconstructable is reported once per code.
  if (omitted > 0) state.warn('UNSAFE_ATTRIBUTE_OMITTED', omitted);

  // Link hardening: a `target="_blank"` anchor always keeps a safe rel.
  if (hrefEmitted && emitted.get('target') === '_blank' && !emitted.has('rel')) {
    emitted.set('rel', 'noopener noreferrer');
  }

  const originalClass = node.attributes.class;
  const classTokens: string[] = [];
  if (options.includeOriginalClasses && typeof originalClass === 'string' && originalClass !== '') {
    classTokens.push(originalClass);
  }
  if (generatedClass !== null) classTokens.push(generatedClass);
  if (classTokens.length > 0) emitted.set('class', classTokens.join(' '));

  // Canonical emission order keeps the output byte-deterministic.
  const orderedNames = [
    ...ATTRIBUTE_ORDER.filter((name) => emitted.has(name)),
    ...Array.from(emitted.keys())
      .filter((name) => !ATTRIBUTE_ORDER.includes(name))
      .sort(),
  ];

  let html = '';
  for (const name of orderedNames) {
    const value = emitted.get(name);
    if (value === undefined) continue;
    html += serializeAttribute(name, value);
  }

  state.counters.attributesReconstructed += orderedNames.length;
  return { html, emitted: orderedNames.length };
}
