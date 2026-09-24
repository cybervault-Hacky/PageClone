import { beforeEach, describe, expect, it } from 'vitest';
import { resetDom, TEST_PAGE_URL } from '../helpers/dom';
import { reconstructCapture } from '@/shared/reconstruct';
import { captureCurrent, fixtureSimplePage } from './fixtures';

beforeEach(() => {
  resetDom();
});

describe('reconstruction — document assembly', () => {
  it('emits doctype, html/head/body in the documented shape', () => {
    const result = reconstructCapture(fixtureSimplePage());
    expect(result.html.startsWith('<!doctype html>\n<html')).toBe(true);
    expect(result.html).toContain('<head>');
    expect(result.html).toContain('</head>');
    expect(result.html).toContain('<body');
    expect(result.html.trimEnd().endsWith('</html>')).toBe(true);
    expect(result.html.indexOf('<body')).toBeGreaterThan(result.html.indexOf('</head>'));
  });

  it('emits charset and viewport meta tags exactly once', () => {
    const result = reconstructCapture(fixtureSimplePage());
    expect(result.html.match(/<meta charset="utf-8">/g)?.length).toBe(1);
    expect(
      result.html.match(/<meta name="viewport" content="width=device-width, initial-scale=1">/g)
        ?.length,
    ).toBe(1);
  });

  it('reconstructs the captured title', () => {
    const result = reconstructCapture(fixtureSimplePage());
    expect(result.html).toContain('<title>Simple Page</title>');
  });

  it('falls back to the hostname when no title exists', () => {
    resetDom('', '<p>x</p>');
    const result = reconstructCapture(captureCurrent());
    expect(result.html).toContain(`<title>example.com</title>`);
  });

  it('emits lang and dir from captured metadata', () => {
    resetDom('', '<p>x</p>');
    document.documentElement.setAttribute('lang', 'ar');
    const rtl = reconstructCapture({
      ...captureCurrent(),
      page: { ...captureCurrent().page, direction: 'rtl' },
    });
    expect(rtl.html).toContain('<html lang="ar" dir="rtl"');
    const ltr = reconstructCapture({
      ...captureCurrent(),
      page: { ...captureCurrent().page, direction: 'ltr' },
    });
    expect(ltr.html).toContain('<html lang="ar"');
    expect(ltr.html).not.toContain('dir="ltr"');
  });

  it('omits a hostile lang value and warns', () => {
    const result = reconstructCapture({
      ...fixtureSimplePage(),
      page: { ...fixtureSimplePage().page, language: '<script>' },
      nodes: fixtureSimplePage().nodes.map((node) =>
        node.tagName === 'html' ? { ...node, attributes: {} } : node,
      ),
    });
    expect(result.html).not.toContain('lang="<script>"');
    expect(result.warnings.some((warning) => warning.code === 'UNSAFE_ATTRIBUTE_OMITTED')).toBe(
      true,
    );
  });

  it('embeds the stylesheet inside <style> in the head', () => {
    const result = reconstructCapture(fixtureSimplePage());
    const styleStart = result.html.indexOf('<style>');
    const styleEnd = result.html.indexOf('</style>');
    expect(styleStart).toBeGreaterThan(-1);
    expect(styleEnd).toBeGreaterThan(styleStart);
    expect(styleEnd).toBeLessThan(result.html.indexOf('</head>'));
    expect(result.html.slice(styleStart, styleEnd)).toContain('.pc-n');
  });

  it('emits a favicon link only for safe favicon URLs', () => {
    const withFavicon = reconstructCapture({
      ...fixtureSimplePage(),
      page: { ...fixtureSimplePage().page, faviconUrl: 'https://example.com/favicon.ico' },
    });
    expect(withFavicon.html).toContain('<link rel="icon" href="https://example.com/favicon.ico">');

    const unsafe = reconstructCapture({
      ...fixtureSimplePage(),
      page: { ...fixtureSimplePage().page, faviconUrl: 'javascript:alert(1)' },
    });
    expect(unsafe.html).not.toContain('rel="icon"');
  });

  it('respects includeFavicon=false', () => {
    const result = reconstructCapture(
      {
        ...fixtureSimplePage(),
        page: { ...fixtureSimplePage().page, faviconUrl: 'https://example.com/favicon.ico' },
      },
      { includeFavicon: false },
    );
    expect(result.html).not.toContain('rel="icon"');
  });

  it('never emits scripts, tracking tags, or captured head tags', () => {
    resetDom(
      '<script>var tracked = 1;</script><meta name="generator" content="evil"><link rel="stylesheet" href="/x.css">',
      '<p>x</p>',
    );
    const result = reconstructCapture(captureCurrent());
    expect(result.html).not.toContain('<script');
    expect(result.html).not.toContain('tracked');
    expect(result.html).not.toContain('rel="stylesheet"');
    expect(result.warnings.some((warning) => warning.code === 'HEAD_METADATA_SIMPLIFIED')).toBe(
      true,
    );
  });

  it('uses the captured page URL for reference resolution', () => {
    resetDom('', '<a href="/docs">Docs</a>');
    const result = reconstructCapture(captureCurrent());
    expect(result.html).toContain(`href="https://example.com/docs"`);
    expect(TEST_PAGE_URL).toBe('https://example.com/docs/page');
  });
});
