/**
 * HTML escaping for the reconstruction renderer.
 *
 * ALL captured text and attribute values are escaped — captured content is
 * data, never markup. Escaping all five characters everywhere also gives the
 * output validator a hard invariant: a raw `<`, `>` or `"` in the generated
 * document can only ever originate from the renderer itself, never from
 * captured page content.
 */
const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const ESCAPE_PATTERN = /[&<>"']/g;

export function escapeHtml(value: string): string {
  return value.replace(ESCAPE_PATTERN, (char) => ESCAPES[char] ?? char);
}
