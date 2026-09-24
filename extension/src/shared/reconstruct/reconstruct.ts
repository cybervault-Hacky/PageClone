/**
 * High-level reconstruction API (Phase 3).
 *
 *   CaptureResult → reconstructCapture() → ReconstructionResult
 *
 * Pipeline: validate input (reusing the Phase 2 validator — no duplicated
 * security logic) → deterministic state → CSS renderer (registers generated
 * classes) → HTML renderer → document assembler → statistics + warnings.
 *
 * The function is pure: no Chrome APIs, no I/O, no randomness, no clocks.
 * Given an identical CaptureResult it returns byte-identical output.
 */
import { validateCaptureResult } from '@/shared/validation/capture';
import {
  DEFAULT_RECONSTRUCTION_OPTIONS,
  LANGUAGE_ATTRIBUTE_PATTERN,
  RECONSTRUCTION_RESULT_VERSION,
} from '@/shared/constants/reconstruct';
import type { CaptureResult } from '@/shared/types/capture';
import type {
  AssembledPageMetadata,
  ReconstructionOptions,
  ReconstructionResult,
} from '@/shared/types/reconstruct';
import { ReconstructionInputError } from '../types/reconstruct';
import { resolveFaviconUrl } from '@/shared/utils/url';
import { utf8ByteLength } from './bytes';
import { renderStyleSheet } from './css/render';
import { assembleDocument } from './document/assemble';
import { renderBodyContent } from './html/render';
import { createReconstructionState, toStatisticsAndWarnings } from './state';

/** Merges a partial options object with the defaults, ignoring junk. */
export function resolveReconstructionOptions(
  partial: Partial<ReconstructionOptions> | undefined,
): ReconstructionOptions {
  const merged = { ...DEFAULT_RECONSTRUCTION_OPTIONS };
  if (partial !== undefined) {
    for (const key of Object.keys(DEFAULT_RECONSTRUCTION_OPTIONS) as Array<
      keyof ReconstructionOptions
    >) {
      const value = partial[key];
      if (typeof value === 'boolean') merged[key] = value;
    }
  }
  return merged;
}

function prepareMetadata(
  capture: CaptureResult,
  options: ReconstructionOptions,
  onUnsafeLanguage: () => void,
): { metadata: AssembledPageMetadata; languageAttribute: string | null } {
  const page = capture.page;

  // `lang` prefers the captured html attribute, falling back to metadata.
  const htmlNode = capture.nodes[0];
  const capturedLang =
    htmlNode !== undefined && htmlNode.tagName === 'html' ? htmlNode.attributes.lang : undefined;
  const langCandidate = capturedLang ?? (page.language !== '' ? page.language : null);
  const languageAttribute =
    langCandidate !== null && LANGUAGE_ATTRIBUTE_PATTERN.test(langCandidate) ? langCandidate : null;
  if (langCandidate !== null && languageAttribute === null) onUnsafeLanguage();

  const favicon =
    options.includeFavicon && page.faviconUrl !== null ? resolveFaviconUrl(page.faviconUrl) : null;

  return {
    metadata: {
      title: page.title,
      language: page.language,
      direction: page.direction,
      faviconUrl: favicon,
    },
    languageAttribute,
  };
}

/** First svg-inline asset per node id (deterministic: lowest assetId wins). */
function buildSvgAssetIndex(capture: CaptureResult): Map<number, CaptureResult['assets'][number]> {
  const index = new Map<number, CaptureResult['assets'][number]>();
  for (const asset of capture.assets) {
    if (asset.kind !== 'svg-inline' || asset.nodeId === null) continue;
    if (!index.has(asset.nodeId)) index.set(asset.nodeId, asset);
  }
  return index;
}

/**
 * Reconstructs a validated CaptureResult into a standalone HTML + CSS
 * document. Throws ReconstructionInputError when the input is not a valid
 * CaptureResult — reconstruction never guesses.
 */
export function reconstructCapture(
  capture: CaptureResult,
  options?: Partial<ReconstructionOptions>,
): ReconstructionResult {
  const validated = validateCaptureResult(capture);
  if (!validated.ok) {
    throw new ReconstructionInputError('Reconstruction requires a valid CaptureResult.');
  }

  const resolvedOptions = resolveReconstructionOptions(options);
  const state = createReconstructionState(resolvedOptions);

  // CSS first: it registers the generated classes the HTML renderer attaches.
  const css = resolvedOptions.includeStyles ? renderStyleSheet(capture, state) : '';
  const { bodyHtml, bodyClass, htmlClass, htmlNode } = renderBodyContent({
    capture,
    state,
    options: resolvedOptions,
    pageUrl: capture.page.url,
    nodesById: new Map(capture.nodes.map((node) => [node.nodeId, node])),
    svgMarkupByNode: buildSvgAssetIndex(capture),
  });

  const { metadata, languageAttribute } = prepareMetadata(capture, resolvedOptions, () =>
    state.warn('UNSAFE_ATTRIBUTE_OMITTED'),
  );
  const title = metadata.title ?? capture.page.hostname;

  const html = assembleDocument({
    language: languageAttribute,
    direction: metadata.direction,
    title,
    faviconUrl: metadata.faviconUrl,
    htmlClass: htmlNode !== null ? htmlClass : null,
    bodyClass,
    bodyHtml,
    css,
  });

  if (state.counters.externalAssetReferences > 0) {
    state.warn('EXTERNAL_ASSET_REFERENCE', state.counters.externalAssetReferences);
  }

  const { statistics, warnings } = toStatisticsAndWarnings(state);
  const finalStatistics = {
    ...statistics,
    htmlBytes: utf8ByteLength(html),
    cssBytes: utf8ByteLength(css),
  };

  return {
    version: RECONSTRUCTION_RESULT_VERSION,
    html,
    css,
    statistics: finalStatistics,
    warnings,
  };
}
