import { beforeEach, describe, expect, it } from 'vitest';
import { useCaptureAnalysis } from '@/popup/hooks/useCaptureAnalysis';
import { MESSAGE_CHANNELS } from '@/shared/constants';
import { CAPTURE_RESULT_VERSION } from '@/shared/constants/capture';
import { createCaptureRequestId } from '@/shared/messaging/protocol';
import type { PageMetadata } from '@/shared/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { chromeMock } from './chromeMock';
import { capture, resetDom } from './helpers/dom';

const page: PageMetadata = {
  tabId: 12,
  url: 'https://www.example.com/pricing',
  hostname: 'www.example.com',
  title: 'Example',
  faviconUrl: null,
};

function okResponse(requestId: string): unknown {
  resetDom('', '<article><h1>Page</h1></article>');
  const result = capture();
  return {
    channel: MESSAGE_CHANNELS.capture,
    type: 'capture-response',
    requestId,
    ok: true,
    result: JSON.parse(JSON.stringify(result)),
  };
}

beforeEach(() => {
  resetDom('', '<p>ready</p>');
});

describe('useCaptureAnalysis', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useCaptureAnalysis());
    expect(result.current.phase).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('runs idle → analyzing → ready with a real result', async () => {
    chromeMock.runtime.sendMessage.mockImplementation(
      (message: { requestId: string }, callback?: (response: unknown) => void) => {
        callback?.(okResponse(message.requestId));
      },
    );

    const { result } = renderHook(() => useCaptureAnalysis());
    act(() => result.current.analyze(page));

    expect(result.current.phase).toBe('analyzing');

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.result?.version).toBe(CAPTURE_RESULT_VERSION);
    expect(result.current.result?.statistics.elementsCaptured).toBeGreaterThan(0);
    expect(result.current.error).toBeNull();
    // request targeted the right tab/page
    const sent = chromeMock.runtime.sendMessage.mock.calls[0]?.[0] as {
      tabId: number;
      targetUrl: string;
      type: string;
    };
    expect(sent.tabId).toBe(12);
    expect(sent.targetUrl).toBe(page.url);
    expect(sent.type).toBe('capture-request');
  });

  it('runs idle → analyzing → error with canonical copy', async () => {
    chromeMock.runtime.sendMessage.mockImplementation(
      (message: { requestId: string }, callback?: (response: unknown) => void) => {
        callback?.({
          channel: MESSAGE_CHANNELS.capture,
          type: 'capture-response',
          requestId: message.requestId,
          ok: false,
          code: 'CAPTURE_PAGE_CHANGED',
          message: 'The page changed during analysis. Please try again.',
        });
      },
    );

    const { result } = renderHook(() => useCaptureAnalysis());
    act(() => result.current.analyze(page));
    await waitFor(() => expect(result.current.phase).toBe('error'));

    expect(result.current.error?.code).toBe('CAPTURE_PAGE_CHANGED');
    expect(result.current.error?.message).toBe(
      'The page changed during analysis. Please try again.',
    );
    expect(result.current.result).toBeNull();
  });

  it('maps a missing background response to a structured error (no hang)', async () => {
    // default mock invokes callback with undefined → invalid result path
    const { result } = renderHook(() => useCaptureAnalysis());
    act(() => result.current.analyze(page));
    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.error?.code).toBe('CAPTURE_INVALID_RESULT');
  });

  it('supports retry after an error', async () => {
    let attempt = 0;
    chromeMock.runtime.sendMessage.mockImplementation(
      (message: { requestId: string }, callback?: (response: unknown) => void) => {
        attempt += 1;
        if (attempt === 1) {
          callback?.({
            channel: MESSAGE_CHANNELS.capture,
            type: 'capture-response',
            requestId: message.requestId,
            ok: false,
            code: 'CAPTURE_TIMEOUT',
            message: 'Analysis took too long and was stopped. Please try again.',
          });
          return;
        }
        callback?.(okResponse(message.requestId));
      },
    );

    const { result } = renderHook(() => useCaptureAnalysis());
    act(() => result.current.analyze(page));
    await waitFor(() => expect(result.current.phase).toBe('error'));

    act(() => result.current.analyze(page));
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.error).toBeNull();
    expect(result.current.result).not.toBeNull();
  });

  it('ignores stale responses after reset', async () => {
    let release: ((value: unknown) => void) | undefined;
    chromeMock.runtime.sendMessage.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        release = (value: unknown) => callback?.(value);
      },
    );

    const { result } = renderHook(() => useCaptureAnalysis());
    act(() => result.current.analyze(page));
    expect(result.current.phase).toBe('analyzing');

    act(() => result.current.reset());
    expect(result.current.phase).toBe('idle');

    // late response arrives — must not resurrect old state
    act(() => {
      release?.({
        channel: MESSAGE_CHANNELS.capture,
        type: 'capture-response',
        requestId: createCaptureRequestId(),
        ok: false,
        code: 'CAPTURE_FAILED',
        message: 'stale',
      });
    });
    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('sends unique request ids per run', async () => {
    const ids: string[] = [];
    chromeMock.runtime.sendMessage.mockImplementation(
      (message: { requestId: string }, callback?: (response: unknown) => void) => {
        ids.push(message.requestId);
        callback?.(okResponse(message.requestId));
      },
    );

    const { result } = renderHook(() => useCaptureAnalysis());
    act(() => result.current.analyze(page));
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    act(() => result.current.analyze(page));
    await waitFor(() => expect(ids).toHaveLength(2));
    expect(ids[0]).not.toBe(ids[1]);
  });
});
