/**
 * Reconstruction data model (Phase 3).
 *
 * The reconstruction engine consumes a validated CaptureResult and produces
 * a standalone HTML/CSS document representation. Everything here is
 * JSON-serializable: no DOM references, no functions, no timestamps inside
 * the generated output.
 */
import type { CapturePageMetadata } from './capture';

/** Schema version produced by the current reconstruction engine. */
export type ReconstructionWarningCode =
  | 'UNSUPPORTED_ELEMENT'
  | 'UNSAFE_ELEMENT_REMOVED'
  | 'UNSAFE_ATTRIBUTE_OMITTED'
  | 'UNSAFE_URL_OMITTED'
  | 'STYLE_PROPERTY_OMITTED'
  | 'PSEUDO_ELEMENT_UNAVAILABLE'
  | 'EXTERNAL_ASSET_REFERENCE'
  | 'FORM_VALUE_OMITTED'
  | 'SVG_MARKUP_UNAVAILABLE'
  | 'HEAD_METADATA_SIMPLIFIED';

/**
 * One reconstruction limitation. Warnings are deduplicated per code; `count`
 * records how often the situation occurred during the deterministic walk.
 */
export interface ReconstructionWarning {
  readonly code: ReconstructionWarningCode;
  readonly message: string;
  readonly count: number;
}

/** Aggregate counters describing a reconstruction run. */
export interface ReconstructionStatistics {
  /** Captured element nodes represented in the output (incl. shells/SVG). */
  readonly nodesReconstructed: number;
  /** Captured element nodes not represented (removed or head-simplified). */
  readonly nodesSkipped: number;
  /** Unsupported elements whose children were kept (element itself dropped). */
  readonly elementsUnwrapped: number;
  /** Captured text values emitted as escaped text. */
  readonly textNodesReconstructed: number;
  /** Attributes emitted onto reconstructed elements (incl. generated class). */
  readonly attributesReconstructed: number;
  /** Declarations emitted into element rules. */
  readonly stylesReconstructed: number;
  /** Rules emitted (element + pseudo-element rules). */
  readonly styleRules: number;
  /** ::before / ::after blocks emitted. */
  readonly pseudoElementsReconstructed: number;
  /** Inline SVGs reconstructed from sanitized asset markup. */
  readonly svgInlineReconstructed: number;
  /** Number of deduplicated warning entries. */
  readonly warnings: number;
  /** UTF-8 byte length of the generated HTML document. */
  readonly htmlBytes: number;
  /** UTF-8 byte length of the generated stylesheet. */
  readonly cssBytes: number;
}

/**
 * Tunable reconstruction behaviour with safe defaults
 * (see DEFAULT_RECONSTRUCTION_OPTIONS). These flags only narrow what the
 * capture already contains — reconstruction can never widen the capture's
 * security boundary.
 */
export interface ReconstructionOptions {
  /** Generate CSS from the captured computed styles. */
  readonly includeStyles: boolean;
  /** Emit ::before/::after rules from captured pseudo data. */
  readonly includePseudoElements: boolean;
  /** Emit `src` attributes on image-like elements. */
  readonly includeImages: boolean;
  /** Emit `href` on anchors (safe URLs only). */
  readonly includeLinks: boolean;
  /** Keep the original captured `class` token list next to generated ones. */
  readonly includeOriginalClasses: boolean;
  /** Emit a favicon link from the captured page metadata. */
  readonly includeFavicon: boolean;
}

/**
 * The typed result of reconstructing a CaptureResult: a complete standalone
 * HTML document plus the stylesheet it embeds. Pure data — safe to store,
 * diff and (in a later phase) export.
 */
export interface ReconstructionResult {
  readonly version: number;
  /** Complete HTML document (`<!doctype html>…</html>`), UTF-8 encoded. */
  readonly html: string;
  /** The stylesheet embedded into the document's `<style>` block. */
  readonly css: string;
  readonly statistics: ReconstructionStatistics;
  readonly warnings: readonly ReconstructionWarning[];
}

/** Head inputs the document assembler derives from captured page metadata. */
export type AssembledPageMetadata = Pick<
  CapturePageMetadata,
  'title' | 'language' | 'direction' | 'faviconUrl'
>;

/** Thrown when reconstructCapture receives an invalid CaptureResult. */
export class ReconstructionInputError extends Error {
  readonly code = 'RECONSTRUCTION_INVALID_INPUT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ReconstructionInputError';
  }
}
