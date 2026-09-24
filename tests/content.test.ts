import { describe, expect, it, vi } from 'vitest';
import { isAnalysisRequest } from '@/content/index';
import { EXTENSION_NAME, MESSAGE_CHANNELS } from '@/shared/constants';
import { chromeMock } from './chromeMock';

describe('content script skeleton', () => {
  it('registers exactly one runtime message listener when loaded', () => {
    expect(chromeMock.listeners.onMessage).toHaveLength(1);
  });

  it('answers analysis requests honestly (no engine in Phase 1)', () => {
    const listener = chromeMock.listeners.onMessage[0];
    expect(listener).toBeDefined();
    if (!listener) return;

    const sendResponse = vi.fn();
    const handled = listener({ type: MESSAGE_CHANNELS.analysis }, { id: 'tab-1' }, sendResponse);

    expect(handled).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, reason: 'analysis-unavailable' });
  });

  it('ignores messages from other channels', () => {
    const listener = chromeMock.listeners.onMessage[0];
    expect(listener).toBeDefined();
    if (!listener) return;

    const sendResponse = vi.fn();
    expect(listener({ type: 'unrelated' }, {}, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('recognizes analysis requests on the internal channel', () => {
    expect(isAnalysisRequest({ type: MESSAGE_CHANNELS.analysis })).toBe(true);
    expect(isAnalysisRequest({ type: 'other' })).toBe(false);
    expect(isAnalysisRequest(null)).toBe(false);
    expect(isAnalysisRequest('pageclone:analysis')).toBe(false);
    expect(isAnalysisRequest(undefined)).toBe(false);
  });
});

describe('shared constants', () => {
  it('exposes the product name', () => {
    expect(EXTENSION_NAME).toBe('PageClone');
  });

  it('uses a namespaced internal analysis channel', () => {
    expect(MESSAGE_CHANNELS.analysis).toMatch(/^pageclone:/);
  });
});
