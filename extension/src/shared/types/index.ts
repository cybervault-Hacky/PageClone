/**
 * Shared domain model for PageClone.
 *
 * Phase 1 only defines the contracts the popup relies on. The capture and
 * reconstruction engine (later phases) will implement the fuller behaviour
 * behind these types without changing the popup UI.
 */

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
 * `idle`, `detecting`, `detected` and `unsupported` are produced by Phase 1
 * tab detection. `analyzing`, `ready` and `error` belong to the future
 * analysis engine; the popup already renders them so Phase 2 only has to
 * drive the state, not redesign the UI.
 */
export type AnalysisPhase = 'idle' | 'detecting' | 'detected' | 'analyzing' | 'ready' | 'error';

/** Error codes surfaced to the UI. Raw stack traces are never shown. */
export type PageCloneErrorCode = 'detection-failed' | 'restricted-page' | 'analysis-failed';

/** Structured status consumed by the popup. */
export interface AnalysisStatus {
  readonly phase: AnalysisPhase;
  readonly page: PageMetadata | null;
  readonly issue: PageIssue | null;
  readonly errorCode: PageCloneErrorCode | null;
}

// ---------------------------------------------------------------------------
// Future engine contracts (later phases) — defined now so the UI and the
// engine can be developed against a stable interface. Not implemented yet.
// ---------------------------------------------------------------------------

/** Request produced when the user asks to capture a page. */
export interface CaptureRequest {
  readonly target: PageTarget;
  readonly includeSubresources?: boolean;
}

/** Outcome of a page capture attempt. */
export type CaptureResult =
  | { readonly ok: true; readonly snapshotId: string }
  | { readonly ok: false; readonly code: PageCloneErrorCode; readonly message: string };

/** A queued job that will export a captured page as a project ZIP. */
export interface ExportJob {
  readonly id: string;
  readonly createdAt: number;
  readonly request: CaptureRequest;
}

/** Outcome of an export job. */
export type ExportResult =
  | { readonly ok: true; readonly fileName: string }
  | { readonly ok: false; readonly code: PageCloneErrorCode; readonly message: string };
