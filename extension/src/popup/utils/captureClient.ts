import { MESSAGE_CHANNELS } from '@/shared/constants';
import {
  captureErrorMessage,
  createCaptureRequestId,
  isCaptureResponseMessage,
} from '@/shared/messaging/protocol';
import type { CaptureRequestMessage } from '@/shared/messaging/protocol';
import type { CaptureErrorCode, CaptureOptions, CaptureOutcome } from '@/shared/types/capture';

/**
 * Thin adapter around `chrome.runtime.sendMessage` for the capture channel.
 * Keeps browser API access out of hooks/components and normalizes every
 * failure into a structured CaptureOutcome (never raw exceptions).
 */
export interface CaptureCall {
  readonly requestId: string;
  readonly tabId: number;
  readonly targetUrl: string;
  readonly options?: Partial<CaptureOptions>;
}

export function requestCapture(call: CaptureCall): Promise<CaptureOutcome> {
  const message: CaptureRequestMessage = {
    channel: MESSAGE_CHANNELS.capture,
    type: 'capture-request',
    requestId: call.requestId !== '' ? call.requestId : createCaptureRequestId(),
    tabId: call.tabId,
    targetUrl: call.targetUrl,
    ...(call.options !== undefined ? { options: call.options } : {}),
  };

  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || typeof chrome.runtime?.sendMessage !== 'function') {
      resolve(failure('CAPTURE_UNAVAILABLE'));
      return;
    }

    let settled = false;
    const settle = (outcome: CaptureOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    try {
      chrome.runtime.sendMessage(message, (response: unknown) => {
        // Reading lastError marks it handled (avoids unchecked-warning noise).
        const lastError = chrome.runtime.lastError;
        if (lastError !== undefined && lastError !== null) {
          settle(failure('CAPTURE_UNAVAILABLE'));
          return;
        }
        if (!isCaptureResponseMessage(response) || response.requestId !== message.requestId) {
          settle(failure('CAPTURE_INVALID_RESULT'));
          return;
        }
        if (response.ok) {
          settle({ ok: true, result: response.result });
          return;
        }
        settle({ ok: false, code: response.code as CaptureErrorCode, message: response.message });
      });
    } catch {
      settle(failure('CAPTURE_UNAVAILABLE'));
    }
  });
}

function failure(code: CaptureErrorCode): CaptureOutcome {
  return { ok: false, code, message: captureErrorMessage(code) };
}
