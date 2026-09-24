/**
 * Tag policy for the reconstruction renderer: every captured tag is either
 * reconstructed as-is, dropped (dangerous), or unwrapped (unsupported — the
 * safe children are kept, the element itself is not).
 */
import { ALLOWED_TAGS, DANGEROUS_TAGS, VOID_ELEMENTS } from '@/shared/constants/reconstruct';

export type TagDisposition = 'allowed' | 'dangerous' | 'unsupported';

export function classifyTag(tagName: string): TagDisposition {
  if (DANGEROUS_TAGS.has(tagName)) return 'dangerous';
  if (ALLOWED_TAGS.has(tagName)) return 'allowed';
  return 'unsupported';
}

export function isVoidElement(tagName: string): boolean {
  return VOID_ELEMENTS.has(tagName);
}

/** Elements whose inner whitespace is significant — never re-indented. */
export function preservesWhitespace(tagName: string): boolean {
  return tagName === 'pre' || tagName === 'textarea';
}

/** Document-shell tags are rendered by the assembler, never inline. */
export function isShellTag(tagName: string): boolean {
  return tagName === 'html' || tagName === 'head' || tagName === 'body';
}
