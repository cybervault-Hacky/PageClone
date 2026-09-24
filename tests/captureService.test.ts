import { describe, expect, it } from 'vitest';
import { MESSAGE_CHANNELS } from '@/shared/constants';
import { handleCaptureRequest } from '@/background/captureService';
import type { CaptureServiceDeps, CaptureTab } from '@/background/captureService';
import { createCaptureRequestId } from '@/shared/messaging/protocol';
import { CAPTURE_RESULT_VERSION } from '@/shared/constants/capture';
import { capture, resetDom } from './helpers/dom';

const TARGET = 'https://www.example.com/pricing';

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    channel: MESSAGE_CHANNELS.capture,
    type: 'capture-request',
    requestId: createCaptureRequestId(),
    tabId: 12,
    targetUrl: TARGET,
    ...overrides,
  };
}

function makeTab(url = TARGET): CaptureTab {
  return { id: 12, url };
}

function engineResultAsResponse(requestId: string): unknown {
  resetDom('', '<main><h1>Real page</h1><img src="a.png"></main>');
  const result = capture();
  return {
    channel: MESSAGE_CHANNELS.capture,
    type: 'capture-response',
    requestId,
    ok: true,
    result: JSON.parse(JSON.stringify(result)),
  };
}

function deps(overrides: Partial<CaptureServiceDeps> = {}): CaptureServiceDeps {
  return {
    getTab: async () => makeTab(),
    sendToTab: async (_tabId, message) => engineResultAsResponse(message.requestId),
    timeoutMs: 50,
    ...overrides,
  };
}

describe('captureService — happy path', () => {
  it('validates a real result and returns success', async () => {
    const request = makeRequest();
    const response = await handleCaptureRequest(request, deps());

    expect(response.requestId).toBe(request.requestId);
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.result.version).toBe(CAPTURE_RESULT_VERSION);
    expect(response.result.nodes.length).toBeGreaterThan(0);
  });

  it('uses the canonical message for content-side failures', async () => {
    const request = makeRequest();
    const response = await handleCaptureRequest(
      request,
      deps({
        sendToTab: async () => ({
          channel: MESSAGE_CHANNELS.capture,
          type: 'capture-response',
          requestId: request.requestId,
          ok: false,
          code: 'CAPTURE_PAGE_CHANGED',
          message: 'content said something custom',
        }),
      }),
    );

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.code).toBe('CAPTURE_PAGE_CHANGED');
    // canonical copy wins — custom strings never flow through unchecked
    expect(response.message).toBe('The page changed during analysis. Please try again.');
  });
});

describe('captureService — failure paths', () => {
  it('rejects malformed requests', async () => {
    const response = await handleCaptureRequest({ nonsense: true }, deps());
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.code).toBe('CAPTURE_INVALID_REQUEST');
  });

  it('returns CAPTURE_UNAVAILABLE when the tab is gone', async () => {
    const response = await handleCaptureRequest(
      makeRequest(),
      deps({ getTab: async () => undefined }),
    );
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.code).toBe('CAPTURE_UNAVAILABLE');
  });

  it('returns CAPTURE_UNAVAILABLE when the tabs API throws', async () => {
    const response = await handleCaptureRequest(
      makeRequest(),
      deps({
        getTab: async () => {
          throw new Error('secret internal stack');
        },
      }),
    );
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.code).toBe('CAPTURE_UNAVAILABLE');
    expect(response.message).not.toContain('secret');
  });

  it('returns CAPTURE_PERMISSION_DENIED for restricted tabs', async () => {
    const response = await handleCaptureRequest(
      makeRequest(),
      deps({ getTab: async () => makeTab('chrome://settings/') }),
    );
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.code).toBe('CAPTURE_PERMISSION_DENIED');
  });

  it('detects page navigation BEFORE dispatching', async () => {
    const response = await handleCaptureRequest(
      makeRequest(),
      deps({ getTab: async () => makeTab('https://www.example.com/other') }),
    );
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.code).toBe('CAPTURE_PAGE_CHANGED');
  });

  it('detects page navigation AFTER capture completed', async () => {
    let call = 0;
    const response = await handleCaptureRequest(
      makeRequest(),
      deps({
        getTab: async () => {
          call += 1;
          return call === 1 ? makeTab() : makeTab('https://www.example.com/navigated');
        },
      }),
    );
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.code).toBe('CAPTURE_PAGE_CHANGED');
  });

  it('treats a hung content script as CAPTURE_TIMEOUT', async () => {
    const response = await handleCaptureRequest(
      makeRequest(),
      deps({
        sendToTab: () => new Promise(() => undefined), // never settles
        timeoutMs: 20,
      }),
    );
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.code).toBe('CAPTURE_TIMEOUT');
  });

  it('treats a rejected sendMessage (no content script) as CAPTURE_UNAVAILABLE', async () => {
    const response = await handleCaptureRequest(
      makeRequest(),
      deps({
        sendToTab: async () => {
          throw new Error('Could not establish connection');
        },
      }),
    );
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.code).toBe('CAPTURE_UNAVAILABLE');
  });

  it('rejects responses with mismatched request ids', async () => {
    const response = await handleCaptureRequest(
      makeRequest(),
      deps({
        sendToTab: async () => ({
          channel: MESSAGE_CHANNELS.capture,
          type: 'capture-response',
          requestId: 'cap-someone-else',
          ok: false,
          code: 'CAPTURE_FAILED',
          message: 'x',
        }),
      }),
    );
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.code).toBe('CAPTURE_INVALID_RESULT');
  });

  it('rejects malformed/garbage responses from the page context', async () => {
    for (const garbage of [undefined, null, 'ok', [], { hello: true }, 42]) {
      const response = await handleCaptureRequest(
        makeRequest(),
        deps({ sendToTab: async () => garbage }),
      );
      expect(response.ok).toBe(false);
      if (!response.ok) expect(response.code).toBe('CAPTURE_INVALID_RESULT');
    }
  });

  it('rejects a forged result with the wrong schema', async () => {
    const request = makeRequest();
    const response = await handleCaptureRequest(
      request,
      deps({
        sendToTab: async () => ({
          channel: MESSAGE_CHANNELS.capture,
          type: 'capture-response',
          requestId: request.requestId,
          ok: true,
          result: { version: CAPTURE_RESULT_VERSION, nodes: 'not-an-array' },
        }),
      }),
    );
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.code).toBe('CAPTURE_INVALID_RESULT');
  });

  it('rejects a forged result with an absurd node count', async () => {
    const request = makeRequest();
    const response = await handleCaptureRequest(
      request,
      deps({
        sendToTab: async () => ({
          channel: MESSAGE_CHANNELS.capture,
          type: 'capture-response',
          requestId: request.requestId,
          ok: true,
          result: {
            ...JSON.parse(JSON.stringify(captureAfterFixture())),
            nodes: Array.from({ length: 9999 }, () => null),
          },
        }),
      }),
    );
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.code).toBe('CAPTURE_LIMIT_REACHED');
  });
});

function captureAfterFixture() {
  resetDom('', '<p>base</p>');
  return capture();
}
