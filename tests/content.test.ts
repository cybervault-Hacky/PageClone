import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCaptureRequest } from '@/content/index';
import { MESSAGE_CHANNELS } from '@/shared/constants';
import { CAPTURE_RESULT_VERSION } from '@/shared/constants/capture';
import { createCaptureRequestId } from './helpers/protocol';
import { chromeMock } from './chromeMock';
import { resetDom } from './helpers/dom';

function request(overrides: Record<string, unknown> = {}) {
  return {
    channel: MESSAGE_CHANNELS.capture,
    type: 'capture-request',
    requestId: createCaptureRequestId(),
    tabId: 12,
    targetUrl: location.href,
    ...overrides,
  };
}

describe('content script endpoint', () => {
  beforeEach(() => {
    resetDom('', '<main><h1>Hello</h1></main>');
  });

  it('registers exactly one runtime message listener when loaded', () => {
    expect(chromeMock.listeners.onMessage).toHaveLength(1);
  });

  it('ignores messages from other channels', () => {
    const listener = chromeMock.listeners.onMessage[0];
    expect(listener).toBeDefined();
    if (!listener) return;

    const sendResponse = vi.fn();
    expect(listener({ type: 'unrelated' }, {}, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('answers a valid capture request with a versioned result', async () => {
    const response = await handleCaptureRequest(request());

    expect(response).not.toBeNull();
    if (!response || !response.ok) throw new Error('expected ok response');
    expect(response.result.version).toBe(CAPTURE_RESULT_VERSION);
    expect(response.result.nodes.length).toBeGreaterThan(0);
    expect(response.result.statistics.elementsCaptured).toBeGreaterThan(0);
    expect(response.result.security.cookiesAccessed).toBe(false);
    expect(response.result.security.storageAccessed).toBe(false);
  });

  it('rejects malformed requests structurally', async () => {
    const response = await handleCaptureRequest(request({ tabId: 'nope' }));
    expect(response?.ok).toBe(false);
    if (!response || response.ok) return;
    expect(response.code).toBe('CAPTURE_INVALID_REQUEST');
    expect(response.message).toMatch(/invalid/i);
  });

  it('refuses to capture a page that does not match the request target', async () => {
    const response = await handleCaptureRequest(request({ targetUrl: 'https://other.test/' }));
    expect(response?.ok).toBe(false);
    if (!response || response.ok) return;
    expect(response.code).toBe('CAPTURE_PAGE_CHANGED');
  });

  it('returns null for non-channel messages so other listeners can run', async () => {
    expect(await handleCaptureRequest({ hello: 'world' })).toBeNull();
  });

  it('never leaks internal error details in failure envelopes', async () => {
    const response = await handleCaptureRequest(request({ targetUrl: 'not-a-url' }));
    // targetUrl that fails validation → INVALID_REQUEST, no stack details
    expect(response?.ok).toBe(false);
    if (!response || response.ok) return;
    expect(response.message).not.toMatch(/at \w+|Error:|\/home\//);
  });
});
