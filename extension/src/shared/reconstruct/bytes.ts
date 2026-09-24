/** Deterministic UTF-8 byte length (used for statistics, never for IDs). */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
