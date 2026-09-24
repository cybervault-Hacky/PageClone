import { beforeEach, describe, expect, it } from 'vitest';
import { requestCapture } from '@/popup/utils/captureClient';
import { MESSAGE_CHANNELS } from '@/shared/constants';
import { CAPTURE_RESULT_VERSION } from '@/shared/constants/capture';
import { chromeMock } from './chromeMock';
import { capture, resetDom } from './helpers/dom';

const call = {
  requestId: 'cap-client-1',
  tabId: 12,
  targetUrl: 'https://www.example.com/pricing',
};

function okResponse(requestId: string): unknown {
  resetDom('', '<p>real content</p>');
  return {
    channel: MESSAGE_CHANNELS.capture,
    type: 'capture-response',
    requestId,
    ok: true,
    result: capture(),
  };
}

beforeEach(() => {
  resetDom('', '<p>ready</p>');
});

describe('captureClient', () => {
  it('sends a well-formed capture request on the capture channel', async () => {
    chromeMock.runtime.sendMessage.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const requestId = (message as { requestId: string }).requestId;
        callback?.(okResponse(requestId));
      },
    );
    const outcome = await requestCapture(call);

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(1);
    const sent = chromeMock.runtime.sendMessage.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent.channel).toBe(MESSAGE_CHANNELS.capture);
    expect(sent.type).toBe('capture-request');
    expect(sent.requestId).toBe('cap-client-1');
    expect(sent.tabId).toBe(12);
    expect(sent.targetUrl).toBe(call.targetUrl);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.version).toBe(CAPTURE_RESULT_VERSION);
  });

  it('includes clamped-able options when provided', async () => {
    chromeMock.runtime.sendMessage.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => callback?.(undefined),
    );
    await requestCapture({ ...call, options: { maxElements: 5000 } });
    const sent = chromeMock.runtime.sendMessage.mock.calls[0]?.[0] as {
      options?: unknown;
    };
    expect(sent.options).toEqual({ maxElements: 5000 });
  });

  it('passes through structured failures from the background', async () => {
    chromeMock.runtime.sendMessage.mockImplementation(
      (message: { requestId: string }, callback?: (response: unknown) => void) => {
        callback?.({
          channel: MESSAGE_CHANNELS.capture,
          type: 'capture-response',
          requestId: message.requestId,
          ok: false,
          code: 'CAPTURE_PERMISSION_DENIED',
          message: 'PageClone cannot analyze this browser page.',
        });
      },
    );
    const outcome = await requestCapture(call);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('CAPTURE_PERMISSION_DENIED');
    expect(outcome.message).toBe('PageClone cannot analyze this browser page.');
  });

  it('maps an undefined response (no background) to CAPTURE_INVALID_RESULT', async () => {
    const outcome = await requestCapture(call);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('CAPTURE_INVALID_RESULT');
  });

  it('maps runtime.lastError to CAPTURE_UNAVAILABLE', async () => {
    chromeMock.runtime.sendMessage.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        (chromeMock.runtime as unknown as { lastError?: { message: string } }).lastError = {
          message: 'The message port closed',
        };
        callback?.(undefined);
        delete (chromeMock.runtime as unknown as { lastError?: { message: string } }).lastError;
      },
    );
    const outcome = await requestCapture(call);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('CAPTURE_UNAVAILABLE');
  });

  it('rejects responses with the wrong requestId', async () => {
    chromeMock.runtime.sendMessage.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        callback?.(okResponse('cap-other-request'));
      },
    );
    const outcome = await requestCapture(call);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('CAPTURE_INVALID_RESULT');
  });

  it('returns a structured error when chrome.runtime is absent', async () => {
    const original = globalThis.chrome;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome = undefined;
    const outcome = await requestCapture(call);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('CAPTURE_UNAVAILABLE');
    (globalThis as unknown as { chrome: typeof original }).chrome = original;
  });
});
