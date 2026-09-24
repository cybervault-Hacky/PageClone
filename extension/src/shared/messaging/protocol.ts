import { MESSAGE_CHANNELS } from '../constants';
import { DEFAULT_CAPTURE_OPTIONS } from '../constants/capture';
import type {
  CaptureErrorCode,
  CaptureOptions,
  CaptureResult,
  CaptureOutcome,
} from '../types/capture';
import { parseUrl } from '../utils/url';

/**
 * Typed message protocol: popup ⇄ background ⇄ content.
 *
 * Every message carries the channel name, a discriminant `type` and a
 * `requestId` so responses can be correlated and stale ones rejected.
 */

export interface CaptureRequestMessage {
  readonly channel: typeof MESSAGE_CHANNELS.capture;
  readonly type: 'capture-request';
  readonly requestId: string;
  readonly tabId: number;
  readonly targetUrl: string;
  readonly options?: Partial<CaptureOptions>;
}

export type CaptureResponseMessage = {
  readonly channel: typeof MESSAGE_CHANNELS.capture;
  readonly type: 'capture-response';
  readonly requestId: string;
} & CaptureOutcome;
// CaptureOutcome failure branch is flat: { ok: false, code, message }.

/** Canonical, user-safe copy for every failure code. Never includes details. */
export const CAPTURE_ERROR_MESSAGES: Readonly<Record<CaptureErrorCode, string>> = {
  CAPTURE_UNAVAILABLE: 'PageClone could not reach this page. Reload the tab and try again.',
  CAPTURE_TIMEOUT: 'Analysis took too long and was stopped. Please try again.',
  CAPTURE_LIMIT_REACHED: 'This page is too large to analyze. Try a smaller page.',
  CAPTURE_INVALID_RESULT: 'PageClone received an unexpected response. Please try again.',
  CAPTURE_INVALID_REQUEST: 'The analysis request was invalid. Please try again.',
  CAPTURE_PAGE_CHANGED: 'The page changed during analysis. Please try again.',
  CAPTURE_PERMISSION_DENIED: 'PageClone does not have access to this page.',
  CAPTURE_SERIALIZATION_FAILED: 'The analysis could not be prepared. Please try again.',
  CAPTURE_FAILED: 'Something went wrong while analyzing this page.',
};

/** Returns the canonical human message for a code (generic fallback). */
export function captureErrorMessage(code: CaptureErrorCode): string {
  return CAPTURE_ERROR_MESSAGES[code] ?? CAPTURE_ERROR_MESSAGES.CAPTURE_FAILED;
}

/** Type guard for wire-level error codes (content/background are untrusted). */
export function isCaptureErrorCode(value: unknown): value is CaptureErrorCode {
  return typeof value === 'string' && value in CAPTURE_ERROR_MESSAGES;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

/** Cheap channel check used by background/content listeners to ignore noise. */
export function isCaptureChannelMessage(value: unknown): boolean {
  return isPlainObject(value) && value.channel === MESSAGE_CHANNELS.capture;
}

/** Full structural validation of an incoming capture request. */
export function isCaptureRequestMessage(value: unknown): value is CaptureRequestMessage {
  if (!isPlainObject(value)) return false;
  if (value.channel !== MESSAGE_CHANNELS.capture) return false;
  if (value.type !== 'capture-request') return false;
  if (!isValidRequestId(value.requestId)) return false;
  if (typeof value.tabId !== 'number' || !Number.isInteger(value.tabId) || value.tabId < 0) {
    return false;
  }
  if (typeof value.targetUrl !== 'string' || value.targetUrl.length > 4096) return false;
  if (parseUrl(value.targetUrl) === null) return false;
  if (value.options !== undefined && !isPlainObject(value.options)) return false;
  return true;
}

/** Full structural validation of a capture response from the content script. */
export function isCaptureResponseMessage(value: unknown): value is CaptureResponseMessage {
  if (!isPlainObject(value)) return false;
  if (value.channel !== MESSAGE_CHANNELS.capture) return false;
  if (value.type !== 'capture-response') return false;
  if (!isValidRequestId(value.requestId)) return false;
  if (typeof value.ok !== 'boolean') return false;
  if (value.ok) return isPlainObject(value.result); // deep validation happens in background
  return (
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    value.message.length <= 512
  );
}

let requestIdCounter = 0;

/** Generates a unique, bounded request id (no external dependencies). */
export function createCaptureRequestId(): string {
  requestIdCounter = (requestIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${requestIdCounter.toString(36)}`;
  return `cap-${random}`;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Merges partial, possibly hostile options with the defaults and clamps
 * every numeric field into the hard limits. Unknown keys are ignored.
 */
export function clampCaptureOptions(partial: unknown): CaptureOptions {
  const input = isPlainObject(partial) ? partial : {};
  const d = DEFAULT_CAPTURE_OPTIONS;
  return {
    includeText: clampBool(input.includeText, d.includeText),
    includeStyles: clampBool(input.includeStyles, d.includeStyles),
    includeImages: clampBool(input.includeImages, d.includeImages),
    includeSvg: clampBool(input.includeSvg, d.includeSvg),
    includeBackgroundImages: clampBool(input.includeBackgroundImages, d.includeBackgroundImages),
    includeLinks: clampBool(input.includeLinks, d.includeLinks),
    includePseudoElements: clampBool(input.includePseudoElements, d.includePseudoElements),
    maxElements: clampInt(input.maxElements, 1, d.maxElements, d.maxElements),
    maxTextLength: clampInt(input.maxTextLength, 0, d.maxTextLength, d.maxTextLength),
    maxTotalText: clampInt(input.maxTotalText, 0, d.maxTotalText, d.maxTotalText),
    maxAssets: clampInt(input.maxAssets, 1, d.maxAssets, d.maxAssets),
  };
}

/** Builds the canonical response envelope for a result. */
export function createCaptureSuccess(
  requestId: string,
  result: CaptureResult,
): CaptureResponseMessage {
  return {
    channel: MESSAGE_CHANNELS.capture,
    type: 'capture-response',
    requestId,
    ok: true,
    result,
  };
}

/** Builds the canonical response envelope for a failure. */
export function createCaptureFailure(
  requestId: string,
  code: CaptureErrorCode,
): CaptureResponseMessage {
  return {
    channel: MESSAGE_CHANNELS.capture,
    type: 'capture-response',
    requestId,
    ok: false,
    code,
    message: captureErrorMessage(code),
  };
}
