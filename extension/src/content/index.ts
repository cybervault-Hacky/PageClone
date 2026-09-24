/**
 * Content script entry point (Phase 2 — active on http/https pages only).
 *
 * Owns page inspection. Responds to typed capture requests from the
 * background service worker with a sanitized CaptureResult or a structured
 * failure. The script never modifies the page, never navigates, and never
 * reads cookies, storage or form values.
 */
import {
  clampCaptureOptions,
  createCaptureFailure,
  createCaptureSuccess,
  isCaptureChannelMessage,
  isCaptureRequestMessage,
} from '@/shared/messaging/protocol';
import type { CaptureResponseMessage } from '@/shared/messaging/protocol';
import { pageIdentity } from '@/shared/utils/url';
import { captureDocument } from './engine/capture';

/** Handles one capture request; always returns a typed response envelope. */
export async function handleCaptureRequest(
  message: unknown,
): Promise<CaptureResponseMessage | null> {
  if (!isCaptureChannelMessage(message)) return null;

  if (!isCaptureRequestMessage(message)) {
    return createCaptureFailure('invalid', 'CAPTURE_INVALID_REQUEST');
  }

  const { requestId, targetUrl, options } = message;

  // Page-change protection: refuse to capture a document that no longer
  // matches the page the popup asked for (hash-only changes are fine).
  if (pageIdentity(location.href) !== pageIdentity(targetUrl)) {
    return createCaptureFailure(requestId, 'CAPTURE_PAGE_CHANGED');
  }

  try {
    const result = captureDocument(clampCaptureOptions(options), location.href);
    return createCaptureSuccess(requestId, result);
  } catch {
    // Internal engine failure — no details leave the content script.
    return createCaptureFailure(requestId, 'CAPTURE_FAILED');
  }
}

function registerListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isCaptureChannelMessage(message)) return false;
    void handleCaptureRequest(message).then((response) => {
      if (response !== null) sendResponse(response);
    });
    return true;
  });
}

// Only wire up when actually injected into a page by the browser.
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  registerListener();
}
