import { beforeEach, describe, expect, it } from 'vitest';
import { classifyTab, detectActivePage } from '@/shared/chrome/tabs';
import { chromeMock, defaultTab } from './chromeMock';

describe('classifyTab', () => {
  it('builds metadata for a normal page', () => {
    const result = classifyTab(defaultTab());
    expect(result).toEqual({
      status: 'supported',
      page: {
        tabId: 12,
        url: 'https://www.example.com/pricing',
        hostname: 'www.example.com',
        title: 'Example — Pricing',
        faviconUrl: 'https://www.example.com/favicon.ico',
      },
    });
  });

  it('normalizes missing title and favicon', () => {
    const result = classifyTab({ id: 1, url: 'https://example.com/', title: '   ' });
    expect(result.status).toBe('supported');
    if (result.status !== 'supported') return;
    expect(result.page.title).toBeNull();
    expect(result.page.faviconUrl).toBeNull();
  });

  it('drops unsafe favicon URLs', () => {
    const result = classifyTab({
      id: 7,
      url: 'https://example.com/',
      favIconUrl: 'javascript:alert(1)',
    });
    expect(result.status).toBe('supported');
    if (result.status !== 'supported') return;
    expect(result.page.faviconUrl).toBeNull();
  });

  it('flags browser-protected pages as unsupported', () => {
    expect(classifyTab({ url: 'chrome://settings/' })).toEqual({
      status: 'unsupported',
      issue: 'restricted',
    });
    expect(classifyTab({ url: 'about:blank' })).toEqual({
      status: 'unsupported',
      issue: 'restricted',
    });
  });

  it('flags tabs that expose no URL as inaccessible', () => {
    expect(classifyTab({ id: 3 })).toEqual({ status: 'error', issue: 'inaccessible' });
    expect(classifyTab({ id: 3, url: '   ' })).toEqual({
      status: 'error',
      issue: 'inaccessible',
    });
  });
});

describe('detectActivePage', () => {
  beforeEach(() => {
    chromeMock.tabs.query.mockClear();
  });

  it('queries the active tab in the current window', async () => {
    const result = await detectActivePage();

    expect(chromeMock.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(result.status).toBe('supported');
  });

  it('returns unsupported for a restricted active tab', async () => {
    chromeMock.tabs.query.mockResolvedValue([
      { id: 5, url: 'chrome://new-tab-page/', title: 'New Tab' },
    ]);

    const result = await detectActivePage();
    expect(result).toEqual({ status: 'unsupported', issue: 'restricted' });
  });

  it('returns no-active-tab when nothing is active', async () => {
    chromeMock.tabs.query.mockResolvedValue([]);
    const result = await detectActivePage();
    expect(result).toEqual({ status: 'error', issue: 'no-active-tab' });
  });

  it('returns an error when the tabs API fails', async () => {
    chromeMock.tabs.query.mockRejectedValue(new Error('boom: secret stack'));
    const result = await detectActivePage();
    expect(result).toEqual({ status: 'error', issue: 'unknown' });
  });

  it('fails safely when the chrome API is unavailable', async () => {
    const original = globalThis.chrome;
    try {
      (globalThis as unknown as { chrome?: unknown }).chrome = undefined;
      const result = await detectActivePage();
      expect(result).toEqual({ status: 'error', issue: 'unknown' });
    } finally {
      (globalThis as unknown as { chrome?: unknown }).chrome = original;
    }
  });
});
