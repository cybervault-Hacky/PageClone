import { describe, expect, it, vi } from 'vitest';
import '@/background/index';
import { MESSAGE_CHANNELS } from '@/shared/constants';
import { chromeMock } from './chromeMock';

describe('background service worker', () => {
  it('wires exactly one onInstalled listener', () => {
    expect(chromeMock.listeners.onInstalled).toHaveLength(1);
  });

  it('handles every install reason without throwing', () => {
    const listener = chromeMock.listeners.onInstalled[0];
    expect(listener).toBeDefined();
    if (!listener) return;

    expect(() => listener({ reason: 'install', localInstall: true })).not.toThrow();
    expect(() => listener({ reason: 'update', previousVersion: '0.0.0' })).not.toThrow();
    expect(() => listener({ reason: 'chrome_update' })).not.toThrow();
  });
});

describe('background — capture message wiring', () => {
  it('registers exactly one runtime.onMessage listener', () => {
    expect(chromeMock.listeners.onMessage).toHaveLength(1);
  });

  it('ignores messages from other channels', () => {
    const listener = chromeMock.listeners.onMessage[0];
    if (!listener) throw new Error('missing onMessage listener');
    const sendResponse = vi.fn();
    expect(listener({ type: 'ping' }, {}, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('claims capture-channel messages and answers with structured failures', async () => {
    const listener = chromeMock.listeners.onMessage[0];
    if (!listener) throw new Error('missing onMessage listener');

    chromeMock.tabs.get.mockResolvedValue({ id: 3, url: 'https://www.example.com/page' });
    chromeMock.tabs.sendMessage.mockResolvedValue(undefined); // no content script yet

    const sendResponse = vi.fn();
    const handled = listener(
      {
        channel: MESSAGE_CHANNELS.capture,
        type: 'capture-request',
        requestId: 'cap-test-1',
        tabId: 3,
        targetUrl: 'https://www.example.com/page',
      },
      {},
      sendResponse,
    );
    expect(handled).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sendResponse).toHaveBeenCalledTimes(1);
    const response = sendResponse.mock.calls[0]?.[0] as { ok: boolean; code?: string };
    expect(response.ok).toBe(false);
    // sendMessage resolved undefined → not a valid envelope from the content script
    expect(response.code).toBe('CAPTURE_INVALID_RESULT');
  });

  it('maps a throwing tabs.sendMessage to CAPTURE_UNAVAILABLE', async () => {
    const listener = chromeMock.listeners.onMessage[0];
    if (!listener) throw new Error('missing onMessage listener');

    chromeMock.tabs.get.mockResolvedValue({ id: 3, url: 'https://www.example.com/page' });
    chromeMock.tabs.sendMessage.mockRejectedValue(
      new Error('Could not establish connection. Receiving end does not exist.'),
    );

    const sendResponse = vi.fn();
    listener(
      {
        channel: MESSAGE_CHANNELS.capture,
        type: 'capture-request',
        requestId: 'cap-test-2',
        tabId: 3,
        targetUrl: 'https://www.example.com/page',
      },
      {},
      sendResponse,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const response = sendResponse.mock.calls[0]?.[0] as { ok: boolean; code?: string };
    expect(response.ok).toBe(false);
    expect(response.code).toBe('CAPTURE_UNAVAILABLE');
  });

  it('rejects malformed capture-channel requests', async () => {
    const listener = chromeMock.listeners.onMessage[0];
    if (!listener) throw new Error('missing onMessage listener');

    const sendResponse = vi.fn();
    listener(
      { channel: MESSAGE_CHANNELS.capture, type: 'capture-request', requestId: '', tabId: 3 },
      {},
      sendResponse,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const response = sendResponse.mock.calls[0]?.[0] as { ok: boolean; code?: string };
    expect(response.ok).toBe(false);
    expect(response.code).toBe('CAPTURE_INVALID_REQUEST');
  });
});
