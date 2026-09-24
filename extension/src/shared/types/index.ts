/**
 * Shared domain model for PageClone.
 *
 * Phase 2 defines the contracts for detection, capture and the future export
 * pipeline. The capture model itself lives in `./capture` and is re-exported
 * here so consumers keep a single import surface. Phase 3 adds the
 * reconstruction model in `./reconstruct`.
 */
import type { CaptureOptions, CaptureRequest } from './capture';

export type * from './capture';
export type * from './reconstruct';

/** Identifies a web page the user wants to clone. */
export interface PageTarget {
  readonly tabId: number;
  readonly url: string;
}

/**
 * Safe metadata about a detected page.
 * Never contains cookies, DOM content, credentials or storage.
 */
export interface PageMetadata {
  /** Tab the page lives in — used to target capture messages. */
  readonly tabId: number;
  readonly url: string;
  readonly hostname: string;
  readonly title: string | null;
  readonly faviconUrl: string | null;
}

/** Why a page cannot be worked with. */
export type PageIssue =
  /** No active tab could be found (e.g. no browser window focused). */
  | 'no-active-tab'
  /** A browser-protected page (chrome://, about:, extension store, …). */
  | 'restricted'
  /** The tab exists but did not share any URL with the extension. */
  | 'inaccessible'
  /** Detection failed unexpectedly. */
  | 'unknown';

/** Result of detecting the current tab when the popup opens. */
export type PageDetection =
  | { readonly status: 'supported'; readonly page: PageMetadata }
  | { readonly status: 'unsupported'; readonly issue: PageIssue }
  | { readonly status: 'error'; readonly issue: PageIssue };

/**
 * Lifecycle of the analysis pipeline.
 *
 * `idle`, `detecting`, `detected` and `unsupported` are produced by tab
 * detection. Phase 2 drives `analyzing → ready | error` from the real
 * capture engine.
 */
export type AnalysisPhase = 'idle' | 'detecting' | 'detected' | 'analyzing' | 'ready' | 'error';

/** Error codes surfaced to the UI for detection-level failures. */
export type PageCloneErrorCode = 'detection-failed' | 'restricted-page' | 'analysis-failed';

/** Structured status consumed by the popup. */
export interface AnalysisStatus {
  readonly phase: AnalysisPhase;
  readonly page: PageMetadata | null;
  readonly issue: PageIssue | null;
  readonly errorCode: PageCloneErrorCode | null;
}

/** A queued job that will export a captured page as a project ZIP (Phase 4). */
export interface ExportJob {
  readonly id: string;
  readonly createdAt: number;
  readonly request: CaptureRequest;
}

/** Outcome of an export job (Phase 4). */
export type ExportResult =
  | { readonly ok: true; readonly fileName: string }
  | { readonly ok: false; readonly code: PageCloneErrorCode; readonly message: string };

// Re-exported for convenience so `import('./index')` also sees options.
export type { CaptureOptions };
