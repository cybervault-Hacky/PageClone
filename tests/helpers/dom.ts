import { DEFAULT_CAPTURE_OPTIONS } from '@/shared/constants/capture';
import { captureDocument } from '@/content/engine/capture';
import type { CaptureOptions, CaptureResult } from '@/shared/types';

/** Deterministic page URL used by capture tests (relative URLs resolve here). */
export const TEST_PAGE_URL = 'https://example.com/docs/page';

/** Resets the shared jsdom document to a known head/body state. */
export function resetDom(headHtml = '', bodyHtml = ''): void {
  document.head.innerHTML = headHtml;
  document.body.innerHTML = bodyHtml;
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
}

/** Captures the current jsdom document against the test page URL. */
export function capture(
  options: Partial<CaptureOptions> = {},
  deps: { now?: () => number } = {},
): CaptureResult {
  return captureDocument({ ...DEFAULT_CAPTURE_OPTIONS, ...options }, TEST_PAGE_URL, document, deps);
}

/** Convenience JSON dump for "value must never appear" security assertions. */
export function dump(result: CaptureResult): string {
  return JSON.stringify(result);
}

/** Finds a captured node by tag name (first match). */
export function findByTag(result: CaptureResult, tagName: string): CaptureResult['nodes'][number] {
  const node = result.nodes.find((n) => n.tagName === tagName);
  if (node === undefined) throw new Error(`no captured node <${tagName}>`);
  return node;
}
