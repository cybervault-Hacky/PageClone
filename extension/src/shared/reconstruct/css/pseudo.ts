/**
 * Pseudo-element CSS reconstruction (::before / ::after).
 *
 * Input is the conservative PseudoElementStyle captured in Phase 2 (whose
 * `content` field stores the already-quoted computed content string). Every
 * value passes the same sanitization as regular declarations; the content
 * string can never become markup.
 */
import type { PseudoElementStyle } from '@/shared/types/capture';
import { sanitizeCssValue } from './values';
import { isNoOpValue } from './properties';

interface PseudoField {
  readonly property: string;
  readonly value: string | null;
}

function pseudoFields(pseudo: PseudoElementStyle): PseudoField[] {
  return [
    { property: 'content', value: pseudo.content ?? null },
    { property: 'display', value: pseudo.display ?? null },
    { property: 'position', value: pseudo.position ?? null },
    { property: 'top', value: pseudo.top ?? null },
    { property: 'left', value: pseudo.left ?? null },
    { property: 'width', value: pseudo.width ?? null },
    { property: 'height', value: pseudo.height ?? null },
    { property: 'color', value: pseudo.color ?? null },
    { property: 'background-color', value: pseudo.backgroundColor ?? null },
    { property: 'background-image', value: pseudo.backgroundImage ?? null },
    { property: 'font-size', value: pseudo.fontSize ?? null },
    { property: 'font-weight', value: pseudo.fontWeight ?? null },
    { property: 'line-height', value: pseudo.lineHeight ?? null },
    { property: 'border', value: pseudo.border ?? null },
    { property: 'border-radius', value: pseudo.borderRadius ?? null },
    { property: 'transform', value: pseudo.transform ?? null },
  ];
}

export interface PseudoRule {
  readonly selector: string;
  readonly declarations: string[];
}

/**
 * Builds a pseudo-element rule; returns null when nothing usable remains.
 * `hasContent` without a captured content string still emits an empty
 * content box plus a PSEUDO_ELEMENT_UNAVAILABLE warning.
 */
export function renderPseudoRule(
  selector: string,
  pseudo: PseudoElementStyle,
  pageUrl: string,
  onWarning: (count: number) => void,
): PseudoRule | null {
  const declarations: string[] = [];

  if (pseudo.hasContent) {
    const content = pseudo.content;
    if (typeof content === 'string') {
      const sanitized = sanitizeCssValue('content', content, pageUrl);
      if (sanitized.ok) {
        declarations.push(`content: ${sanitized.value};`);
      } else {
        declarations.push('content: "";');
        onWarning(1);
      }
    } else {
      // Content existed visually but its string was not captured.
      declarations.push('content: "";');
      onWarning(1);
    }
  }

  for (const field of pseudoFields(pseudo)) {
    if (field.property === 'content') continue;
    const raw = field.value;
    if (raw === null || raw === '') continue;
    if (isNoOpValue(field.property, raw)) continue;
    const sanitized = sanitizeCssValue(field.property, raw, pageUrl);
    if (!sanitized.ok) {
      onWarning(1);
      continue;
    }
    declarations.push(`${field.property}: ${sanitized.value};`);
  }

  if (declarations.length === 0) return null;
  return { selector, declarations };
}
