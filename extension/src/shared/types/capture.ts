/**
 * Capture engine data model (Phase 2).
 *
 * Everything here is JSON-serializable: no DOM references, no functions.
 * The background validates values of these types before they reach the popup,
 * and the Phase 3 reconstruction engine consumes them as its input.
 */
import type { PageTarget } from './index';

/** Request produced when the user asks to capture a page. */
export interface CaptureRequest {
  readonly target: PageTarget;
  readonly options?: Partial<CaptureOptions>;
}

/** Tunable capture behaviour with safe defaults (see DEFAULT_CAPTURE_OPTIONS). */
export interface CaptureOptions {
  readonly includeText: boolean;
  readonly includeStyles: boolean;
  readonly includeImages: boolean;
  readonly includeSvg: boolean;
  readonly includeBackgroundImages: boolean;
  readonly includeLinks: boolean;
  readonly includePseudoElements: boolean;
  /** Hard cap on captured element nodes. */
  readonly maxElements: number;
  /** Max characters of normalized text per node. */
  readonly maxTextLength: number;
  /** Max characters of normalized text across the whole capture. */
  readonly maxTotalText: number;
  /** Max discovered asset references. */
  readonly maxAssets: number;
}

/** Rendered geometry in CSS pixels, viewport-relative (getBoundingClientRect). */
export interface BoxGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Page-level viewport and document dimensions at capture time. */
export interface ViewportInfo {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
}

/** Safe page metadata captured with the document (never cookies/storage). */
export interface CapturePageMetadata {
  readonly url: string;
  readonly hostname: string;
  readonly title: string | null;
  /** `lang` attribute value; empty string when absent. */
  readonly language: string;
  readonly direction: 'ltr' | 'rtl';
  readonly faviconUrl: string | null;
}

/** Non-sensitive ARIA/semantic hints derived during inspection. */
export interface NodeSemantics {
  readonly interactive: boolean;
  readonly headingLevel: number | null;
}

/**
 * Visual properties captured for ::before / ::after.
 *
 * Phase 3 reconstruction emits these as `.pc-n<N>::before/::after` rules.
 * `content` stores the computed (already quoted/escaped) content string;
 * the remaining fields are optional so captures produced before Phase 3
 * remain valid. All values pass reconstruction-side sanitization again.
 */
export interface PseudoElementStyle {
  readonly hasContent: boolean;
  readonly color: string | null;
  readonly backgroundColor: string | null;
  readonly backgroundImage: string | null;
  /** Computed content string (e.g. `"•"`), when captured. */
  readonly content?: string | null;
  readonly display?: string | null;
  readonly position?: string | null;
  readonly top?: string | null;
  readonly left?: string | null;
  readonly width?: string | null;
  readonly height?: string | null;
  readonly fontSize?: string | null;
  readonly fontWeight?: string | null;
  readonly lineHeight?: string | null;
  readonly border?: string | null;
  readonly borderRadius?: string | null;
  readonly transform?: string | null;
}

/**
 * Normalized intermediate representation of one element node.
 * The tree is recoverable from `parentId` / `childNodeIds` + document order.
 */
export interface CapturedNode {
  readonly nodeId: number;
  readonly parentId: number | null;
  readonly childNodeIds: number[];
  /** Lower-case tag name (e.g. "div", "h1"). */
  readonly tagName: string;
  /** Allow-listed, sanitized attributes only — never `value`, never `on*`. */
  readonly attributes: Record<string, string>;
  /** Normalized direct text content (absent when text capture is off/empty). */
  readonly text?: string;
  /** Whitelisted computed style properties (absent when styles are off). */
  readonly styles?: Record<string, string>;
  readonly layout?: BoxGeometry;
  readonly pseudo?: {
    readonly before?: PseudoElementStyle;
    readonly after?: PseudoElementStyle;
  };
  readonly semantic: NodeSemantics;
  /** True when an inline <svg> was captured as a sanitized asset instead. */
  readonly svg?: boolean;
}

/** Kinds of discovered visual assets. */
export type AssetKind = 'image' | 'background-image' | 'svg-inline' | 'svg-external';

/**
 * Reference to a visual asset. `source` is an absolute http(s)/data:image URL
 * — or, for `svg-inline`, the sanitized SVG markup string. Assets are
 * discovered only; never downloaded or packaged in Phase 2.
 */
export interface AssetReference {
  readonly assetId: number;
  readonly kind: AssetKind;
  readonly source: string;
  readonly nodeId: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string | null;
}

/** Safe metadata for a single anchor element. */
export interface LinkReference {
  readonly nodeId: number;
  readonly href: string;
  readonly target: string | null;
  readonly rel: string | null;
  readonly text: string;
}

/** Aggregate counters describing a capture run. */
export interface CaptureStatistics {
  readonly elementsCaptured: number;
  readonly elementsSkipped: number;
  readonly images: number;
  readonly svgs: number;
  readonly styledElements: number;
  readonly links: number;
  readonly assetsDiscovered: number;
  readonly textCharactersCaptured: number;
  readonly truncated: boolean;
  readonly durationMs: number;
  readonly serializedBytes: number;
}

/** Why a capture produced a partial result. At most one warning per code. */
export type CaptureWarningCode =
  'element-limit' | 'depth-limit' | 'text-limit' | 'asset-limit' | 'duration-limit';

export interface CaptureWarning {
  readonly code: CaptureWarningCode;
  readonly message: string;
}

/**
 * Explicit record of the security boundary. Counter fields track redactions
 * performed; the boolean flags are engine invariants (the engine never
 * touches cookies or web storage) and are regression-tested.
 */
export interface CaptureSecuritySummary {
  readonly formValuesOmitted: number;
  readonly passwordFieldsOmitted: number;
  readonly eventHandlerAttributesDropped: number;
  readonly unsafeUrlsSanitized: number;
  readonly svgScriptsRemoved: number;
  readonly cookiesAccessed: false;
  readonly storageAccessed: false;
}

/** The full, versioned intermediate representation of a captured page. */
export interface CaptureResult {
  readonly version: number;
  readonly capturedAt: number;
  readonly page: CapturePageMetadata;
  readonly viewport: ViewportInfo;
  readonly nodes: readonly CapturedNode[];
  readonly assets: readonly AssetReference[];
  readonly links: readonly LinkReference[];
  readonly statistics: CaptureStatistics;
  readonly warnings: readonly CaptureWarning[];
  readonly security: CaptureSecuritySummary;
}

/** Structured capture failure codes. Never accompanied by stack traces. */
export type CaptureErrorCode =
  | 'CAPTURE_UNAVAILABLE'
  | 'CAPTURE_TIMEOUT'
  | 'CAPTURE_LIMIT_REACHED'
  | 'CAPTURE_INVALID_RESULT'
  | 'CAPTURE_INVALID_REQUEST'
  | 'CAPTURE_PAGE_CHANGED'
  | 'CAPTURE_PERMISSION_DENIED'
  | 'CAPTURE_SERIALIZATION_FAILED'
  | 'CAPTURE_FAILED';

/** Transport-level outcome shared by content → background → popup. */
export type CaptureOutcome =
  | { readonly ok: true; readonly result: CaptureResult }
  | { readonly ok: false; readonly code: CaptureErrorCode; readonly message: string };
