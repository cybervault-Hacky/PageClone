import { MAX_VALUE_LENGTH } from '@/shared/constants/capture';
import { sanitizeSvgMarkup } from '@/shared/security/redact';
import type { AssetKind, AssetReference } from '@/shared/types/capture';
import { extractCssUrl, extractFirstSrcsetUrl, resolveSafeResourceUrl } from '@/shared/utils/url';

/** Bounded collector for discovered assets (no downloading, references only). */
export interface AssetCollector {
  readonly assets: AssetReference[];
  readonly count: () => number;
  push: (asset: Omit<AssetReference, 'assetId'>) => boolean;
}

export function createAssetCollector(maxAssets: number): AssetCollector {
  const assets: AssetReference[] = [];
  return {
    assets,
    count: () => assets.length,
    push(asset) {
      if (assets.length >= maxAssets) return false;
      assets.push({ assetId: assets.length, ...asset });
      return true;
    },
  };
}

function numericAttr(element: Element, name: string): number | null {
  const raw = element.getAttribute(name);
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function pushUrlAsset(
  collector: AssetCollector,
  kind: AssetKind,
  rawUrl: string | null,
  baseHref: string,
  nodeId: number,
  element: Element,
): boolean {
  if (rawUrl === null) return false;
  const resolved = resolveSafeResourceUrl(rawUrl, baseHref);
  if (resolved === null) return false;
  // Very large inline data URLs are skipped to keep the result bounded.
  if (resolved.length > MAX_VALUE_LENGTH) return false;
  const rect = element.getBoundingClientRect();
  const attrWidth = numericAttr(element, 'width');
  const attrHeight = numericAttr(element, 'height');
  return collector.push({
    kind,
    source: resolved,
    nodeId,
    width: attrWidth !== null ? attrWidth : Math.round(rect.width) || null,
    height: attrHeight !== null ? attrHeight : Math.round(rect.height) || null,
    alt: element.getAttribute('alt'),
  });
}

/** Discovers image assets for <img> and <picture><source> elements. */
export function collectImageAssets(
  element: Element,
  nodeId: number,
  baseHref: string,
  collector: AssetCollector,
): void {
  const tag = element.localName.toLowerCase();

  if (tag === 'img') {
    const src = element.getAttribute('src');
    const srcset = element.getAttribute('srcset');
    const primary =
      src !== null && src.trim() !== ''
        ? src
        : srcset !== null
          ? extractFirstSrcsetUrl(srcset)
          : null;
    pushUrlAsset(collector, 'image', primary, baseHref, nodeId, element);
    return;
  }

  if (tag === 'source') {
    const parent = element.parentElement;
    if (parent === null || parent.localName.toLowerCase() !== 'picture') return;
    const srcset = element.getAttribute('srcset');
    if (srcset === null) return;
    const first = extractFirstSrcsetUrl(srcset);
    pushUrlAsset(collector, 'image', first, baseHref, nodeId, element);
  }
}

/** Discovers a background-image URL from a computed style value. */
export function collectBackgroundAsset(
  backgroundImageValue: string | null,
  nodeId: number,
  baseHref: string,
  collector: AssetCollector,
): void {
  const raw = extractCssUrl(backgroundImageValue);
  if (raw === null) return;
  if (raw.length > MAX_VALUE_LENGTH) return;
  const resolved = resolveSafeResourceUrl(raw, baseHref);
  if (resolved === null) return;
  collector.push({
    kind: 'background-image',
    source: resolved,
    nodeId,
    width: null,
    height: null,
    alt: null,
  });
}

/**
 * Captures an inline <svg> as sanitized markup (asset kind `svg-inline`).
 * External SVG references are recorded by the caller as `svg-external`.
 */
export function collectSvgAsset(
  element: Element,
  nodeId: number,
  collector: AssetCollector,
): { scriptsRemoved: number; eventHandlersDropped: number; urlsSanitized: number } {
  const markup = sanitizeSvgMarkup(element.outerHTML);
  if (markup.markup !== null) {
    collector.push({
      kind: 'svg-inline',
      source: markup.markup,
      nodeId,
      width: Math.round(element.getBoundingClientRect().width) || null,
      height: Math.round(element.getBoundingClientRect().height) || null,
      alt: null,
    });
  }
  return {
    scriptsRemoved: markup.scriptsRemoved,
    eventHandlersDropped: markup.eventHandlerAttributesDropped,
    urlsSanitized: markup.unsafeUrlsSanitized,
  };
}
