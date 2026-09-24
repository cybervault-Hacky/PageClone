import { PSEUDO_STYLE_WHITELIST, STYLE_PROPERTY_WHITELIST } from '@/shared/constants/capture';
import { clampValue } from '@/shared/security/redact';
import type { PseudoElementStyle } from '@/shared/types/capture';

/**
 * Reads only whitelisted computed-style properties. Values are bounded;
 * unusable/oversized values are omitted rather than truncated into garbage.
 */
export function readWhitelistedStyles(style: CSSStyleDeclaration | null): Record<string, string> {
  const output: Record<string, string> = {};
  if (style === null) return output;
  for (const property of STYLE_PROPERTY_WHITELIST) {
    const value = clampValue(style.getPropertyValue(property));
    if (value !== null) output[property] = value;
  }
  return output;
}

function readPseudo(
  view: Window | null,
  element: Element,
  pseudo: '::before' | '::after',
): PseudoElementStyle | undefined {
  if (view === null) return undefined;
  // jsdom (the unit-test environment) does not implement pseudo-element
  // styling and logs a not-implemented error per call. All target browsers
  // support it; skip capability-probing in that environment only.
  if (view.navigator.userAgent.includes('jsdom')) return undefined;
  let style: CSSStyleDeclaration;
  try {
    style = view.getComputedStyle(element, pseudo);
  } catch {
    return undefined;
  }

  const read = (property: string): string | null =>
    PSEUDO_STYLE_WHITELIST.includes(property) ? clampValue(style.getPropertyValue(property)) : null;

  const content = style.getPropertyValue('content');
  const hasContent = content !== '' && content !== 'none' && content !== 'normal';
  const backgroundImage = read('background-image');

  // Conservative: only record a pseudo block that actually exists.
  if (!hasContent && (backgroundImage === null || backgroundImage === 'none')) return undefined;

  return {
    hasContent,
    content: hasContent ? read('content') : null,
    color: read('color'),
    backgroundColor: read('background-color'),
    backgroundImage:
      backgroundImage !== null && backgroundImage !== 'none' ? backgroundImage : null,
    display: read('display'),
    position: read('position'),
    top: read('top'),
    left: read('left'),
    width: read('width'),
    height: read('height'),
    fontSize: read('font-size'),
    fontWeight: read('font-weight'),
    lineHeight: read('line-height'),
    border: read('border'),
    borderRadius: read('border-radius'),
    transform: read('transform'),
  };
}

/** Captures the conservative ::before / ::after subset, when present. */
export function readPseudoStyles(
  element: Element,
): { before?: PseudoElementStyle; after?: PseudoElementStyle } | undefined {
  const view = element.ownerDocument.defaultView;
  const before = readPseudo(view, element, '::before');
  const after = readPseudo(view, element, '::after');
  if (before === undefined && after === undefined) return undefined;
  const out: { before?: PseudoElementStyle; after?: PseudoElementStyle } = {};
  if (before !== undefined) out.before = before;
  if (after !== undefined) out.after = after;
  return out;
}
