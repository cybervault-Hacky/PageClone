import { describe, expect, it } from 'vitest';
import {
  getDisplayHostname,
  getHostname,
  isRestrictedUrl,
  resolveFaviconUrl,
} from '@/shared/utils/url';

describe('isRestrictedUrl', () => {
  it.each([
    'chrome://settings/appearance',
    'chrome://new-tab-page/',
    'edge://newtab',
    'about:blank',
    'about:config',
    'view-source:https://example.com',
    'chrome-extension://abcdefghijklmnop/popup.html',
    'devtools://devtools/bundled/inspector.html',
    'chrome-search://local-ntp/start.html',
    'file:///Users/me/secret.html',
    'ws://localhost:8080',
    'https://chromewebstore.google.com/detail/some-extension',
    'https://chrome.google.com/webstore/category/extensions',
    'not a url at all',
    '',
  ])('restricts %s', (url) => {
    expect(isRestrictedUrl(url)).toBe(true);
  });

  it.each([
    'https://example.com',
    'https://example.com/path?q=1#frag',
    'http://localhost:3000',
    'https://sub.domain.co.uk/docs',
  ])('allows %s', (url) => {
    expect(isRestrictedUrl(url)).toBe(false);
  });
});

describe('getHostname', () => {
  it('extracts the hostname from valid URLs', () => {
    expect(getHostname('https://www.example.com/pricing')).toBe('www.example.com');
    expect(getHostname('http://localhost:5173/popup.html')).toBe('localhost');
  });

  it('returns null for invalid or hostless URLs', () => {
    expect(getHostname('garbage')).toBeNull();
    expect(getHostname('')).toBeNull();
  });
});

describe('getDisplayHostname', () => {
  it('strips a leading www. for display', () => {
    expect(getDisplayHostname('www.example.com')).toBe('example.com');
    expect(getDisplayHostname('example.com')).toBe('example.com');
    expect(getDisplayHostname('www.sub.example.co.uk')).toBe('sub.example.co.uk');
  });
});

describe('resolveFaviconUrl', () => {
  it('accepts http(s) and data:image URLs', () => {
    expect(resolveFaviconUrl('https://example.com/favicon.ico')).toBe(
      'https://example.com/favicon.ico',
    );
    expect(resolveFaviconUrl(' http://example.com/f.png ')).toBe('http://example.com/f.png');
    expect(resolveFaviconUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('rejects unsafe or missing values', () => {
    expect(resolveFaviconUrl('javascript:alert(1)')).toBeNull();
    expect(resolveFaviconUrl('chrome://favicon/foo')).toBeNull();
    expect(resolveFaviconUrl('chrome-extension://abc/icon.png')).toBeNull();
    expect(resolveFaviconUrl(undefined)).toBeNull();
    expect(resolveFaviconUrl(null)).toBeNull();
    expect(resolveFaviconUrl('')).toBeNull();
  });
});
