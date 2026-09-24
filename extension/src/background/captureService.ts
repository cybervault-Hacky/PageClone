/**
 * Background capture service: mediates popup ⇄ content, enforces page
 * identity, timeouts and — crucially — validates the CaptureResult before
 * anything reaches the popup.
 */
import {
  createCaptureFailure,
  createCaptureSuccess,
  isCaptureErrorCode,
  isCaptureRequestMessage,
  isCaptureResponseMessage,
} from '@/shared/messaging/protocol';
import type { CaptureRequestMessage, CaptureResponseMessage } from '@/shared/messaging/protocol';
import type { CaptureErrorCode } from '@/shared/types/capture';
import { isRestrictedUrl, pageIdentity } from '@/shared/utils/url';
import { validateCaptureResult } from '@/shared/validation/capture';

export interface CaptureTab {
  readonly id?: number;
  readonly url?: string;
}

export interface CaptureServiceDeps {
  /** Resolves the current state of the target tab (re-checks page identity). */
  readonly getTab: (tabId: number) => Promise<CaptureTab | undefined>;
  /** Sends a message to the tab's content script. */
  readonly sendToTab: (tabId: number, message: CaptureRequestMessage) => Promise<unknown>;
  readonly timeoutMs: number;
}

function failure(requestId: string, code: CaptureErrorCode): CaptureResponseMessage {
  return createCaptureFailure(requestId, code);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Full request lifecycle. Treats the content script as untrusted: the
 * response is schema-validated and re-checked against the tab's identity.
 */
export async function handleCaptureRequest(
  message: unknown,
  deps: CaptureServiceDeps,
): Promise<CaptureResponseMessage> {
  if (!isCaptureRequestMessage(message)) {
    return failure('invalid', 'CAPTURE_INVALID_REQUEST');
  }

  const request: CaptureRequestMessage = message;
  const { requestId, tabId, targetUrl } = request;

  // --- pre-conditions: tab still exists, same page, not restricted ---
  let tab: CaptureTab | undefined;
  try {
    tab = await deps.getTab(tabId);
  } catch {
    return failure(requestId, 'CAPTURE_UNAVAILABLE');
  }
  if (tab === undefined || typeof tab.url !== 'string') {
    return failure(requestId, 'CAPTURE_UNAVAILABLE');
  }
  if (isRestrictedUrl(tab.url)) {
    return failure(requestId, 'CAPTURE_PERMISSION_DENIED');
  }
  if (pageIdentity(tab.url) !== pageIdentity(targetUrl)) {
    return failure(requestId, 'CAPTURE_PAGE_CHANGED');
  }

  // --- dispatch to the content script with a hard timeout ---
  let rawResponse: unknown;
  try {
    rawResponse = await withTimeout(deps.sendToTab(tabId, request), deps.timeoutMs);
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === 'timeout';
    return failure(requestId, isTimeout ? 'CAPTURE_TIMEOUT' : 'CAPTURE_UNAVAILABLE');
  }

  // --- response envelope validation ---
  if (!isCaptureResponseMessage(rawResponse) || rawResponse.requestId !== requestId) {
    return failure(requestId, 'CAPTURE_INVALID_RESULT');
  }
  if (!rawResponse.ok) {
    // Content is untrusted: only canonical codes pass through; anything else
    // collapses to CAPTURE_FAILED (still no internal details to the popup).
    return failure(
      requestId,
      isCaptureErrorCode(rawResponse.code) ? rawResponse.code : 'CAPTURE_FAILED',
    );
  }

  // --- result schema validation (untrusted payload) ---
  const validated = validateCaptureResult(rawResponse.result);
  if (!validated.ok) {
    return failure(requestId, validated.code);
  }

  // --- post-condition: page did not change while capturing ---
  let tabAfter: CaptureTab | undefined;
  try {
    tabAfter = await deps.getTab(tabId);
  } catch {
    return failure(requestId, 'CAPTURE_PAGE_CHANGED');
  }
  if (
    tabAfter === undefined ||
    typeof tabAfter.url !== 'string' ||
    pageIdentity(tabAfter.url) !== pageIdentity(targetUrl)
  ) {
    return failure(requestId, 'CAPTURE_PAGE_CHANGED');
  }

  return createCaptureSuccess(requestId, validated.result);
}
