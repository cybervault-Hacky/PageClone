/**
 * CSS property handling: deterministic declaration order (the capture
 * whitelist order — layout → flex → grid → typography → visual → effects)
 * and bounded no-op skipping.
 */
import { CSS_NOOP_PREFIXES, CSS_NOOP_VALUES } from '@/shared/constants/reconstruct';
import { STYLE_PROPERTY_WHITELIST } from '@/shared/constants/capture';

const PROPERTY_ORDER: ReadonlyMap<string, number> = new Map(
  STYLE_PROPERTY_WHITELIST.map((property, index) => [property, index]),
);

/** Canonical, stable order for declarations inside a rule. */
export function compareProperties(a: string, b: string): number {
  const indexA = PROPERTY_ORDER.get(a) ?? Number.MAX_SAFE_INTEGER;
  const indexB = PROPERTY_ORDER.get(b) ?? Number.MAX_SAFE_INTEGER;
  if (indexA !== indexB) return indexA - indexB;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * True when the captured computed value is a known "no effect" value.
 * Only properties whose initial value equals the browser default are listed,
 * so omitting them can never change rendering (see constants/reconstruct).
 */
export function isNoOpValue(property: string, value: string): boolean {
  const noops = CSS_NOOP_VALUES[property];
  if (noops !== undefined && noops.has(value)) return true;
  const prefixes = CSS_NOOP_PREFIXES[property];
  if (prefixes !== undefined && prefixes.some((prefix) => value.startsWith(prefix))) return true;
  return false;
}
