/**
 * Document assembler: wraps reconstructed body content and the generated
 * stylesheet into a complete standalone HTML document. Head metadata is
 * rebuilt minimally from validated captured page data — no scripts, tracking
 * tags, or arbitrary head elements are ever reproduced.
 *
 * All inputs are pre-validated by the orchestrator; this module only
 * serializes, deterministically.
 */
import { escapeHtml } from '../html/escape';

export interface AssembleDocumentInput {
  /** Pre-validated `lang` attribute value, or null to omit. */
  readonly language: string | null;
  /** 'rtl' emits dir="rtl"; 'ltr' is the default and omitted. */
  readonly direction: 'ltr' | 'rtl';
  /** Final (escaped-ready) title text — already chosen by the caller. */
  readonly title: string;
  /** Pre-validated favicon URL, or null to omit the link element. */
  readonly faviconUrl: string | null;
  /** Generated class for <html>, or null. */
  readonly htmlClass: string | null;
  /** Generated class for <body>, or null. */
  readonly bodyClass: string | null;
  /** Reconstructed body content (trusted renderer output). */
  readonly bodyHtml: string;
  /** Generated stylesheet (trusted renderer output). */
  readonly css: string;
}

function classAttribute(className: string | null): string {
  return className !== null && className !== '' ? ` class="${escapeHtml(className)}"` : '';
}

/**
 * Serializes the standalone document:
 *
 *   <!doctype html>
 *   <html lang dir?>
 *     <head> charset · viewport · title · favicon? · style </head>
 *     <body> …reconstructed content… </body>
 *   </html>
 */
export function assembleDocument(input: AssembleDocumentInput): string {
  const htmlAttrs: string[] = [];
  if (input.language !== null) htmlAttrs.push(` lang="${escapeHtml(input.language)}"`);
  if (input.direction === 'rtl') htmlAttrs.push(' dir="rtl"');
  const htmlClassAttr = classAttribute(input.htmlClass);

  const title = `<title>${escapeHtml(input.title)}</title>`;
  const favicon =
    input.faviconUrl !== null ? `\n<link rel="icon" href="${escapeHtml(input.faviconUrl)}">` : '';
  const style = input.css !== '' ? `\n<style>\n${input.css}</style>` : '';

  return [
    '<!doctype html>',
    `<html${htmlAttrs.join('')}${htmlClassAttr}>`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    title,
    favicon,
    style,
    '</head>',
    `<body${classAttribute(input.bodyClass)}>`,
    input.bodyHtml,
    '</body>',
    '</html>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}
