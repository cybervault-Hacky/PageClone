import { beforeEach, describe, expect, it } from 'vitest';
import { capture, findByTag, resetDom } from './helpers/dom';

beforeEach(() => {
  resetDom();
});

describe('capture — asset discovery', () => {
  it('resolves relative image URLs against the page URL', () => {
    resetDom('', '<img src="images/cat.png" alt="Cat" width="80" height="60">');
    const result = capture();

    expect(result.assets).toHaveLength(1);
    const asset = result.assets[0];
    expect(asset?.kind).toBe('image');
    expect(asset?.source).toBe('https://example.com/docs/images/cat.png');
    expect(asset?.alt).toBe('Cat');
    expect(asset?.width).toBe(80);
    expect(asset?.height).toBe(60);
    expect(result.statistics.images).toBe(1);
  });

  it('keeps absolute http(s) URLs as-is', () => {
    resetDom('', '<img src="https://cdn.example.org/a.jpg">');
    const result = capture();
    expect(result.assets[0]?.source).toBe('https://cdn.example.org/a.jpg');
  });

  it('supports data:image URLs but rejects other data URLs', () => {
    resetDom('', '<img src="data:image/png;base64,AAAA"><img src="data:text/html,<script>">');
    const result = capture();
    const sources = result.assets.map((a) => a.source);
    expect(sources.some((s) => s.startsWith('data:image/'))).toBe(true);
    expect(sources.some((s) => s.startsWith('data:text/html'))).toBe(false);
  });

  it('drops javascript: image sources', () => {
    resetDom('', '<img src="javascript:alert(1)">');
    const result = capture();
    expect(result.assets).toHaveLength(0);
    expect(result.security.unsafeUrlsSanitized).toBeGreaterThan(0);
  });

  it('discovers assets from <picture><source srcset>', () => {
    resetDom(
      '',
      '<picture><source srcset="img/a.png 1x, img/b.png 2x"><img src="img/fallback.png" alt="F"></picture>',
    );
    const result = capture();
    const sources = result.assets.map((a) => a.source);
    expect(sources).toContain('https://example.com/docs/img/a.png');
    expect(sources).toContain('https://example.com/docs/img/fallback.png');
    expect(result.statistics.images).toBeGreaterThanOrEqual(2);
  });

  it('discovers CSS background-image URLs', () => {
    resetDom('', '<div style="background-image: url(../img/bg.jpg)">x</div>');
    const result = capture();
    const bg = result.assets.find((a) => a.kind === 'background-image');
    expect(bg).toBeDefined();
    expect(bg?.source).toBe('https://example.com/img/bg.jpg');
    expect(bg?.nodeId).toBe(findByTag(result, 'div').nodeId);
  });

  it('captures inline SVG as a sanitized svg-inline asset', () => {
    resetDom('', '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
    const result = capture();

    const asset = result.assets.find((a) => a.kind === 'svg-inline');
    expect(asset).toBeDefined();
    expect(asset?.source).toContain('<svg');
    expect(result.statistics.svgs).toBe(1);

    const svgNode = findByTag(result, 'svg');
    expect(svgNode.svg).toBe(true);
    expect(svgNode.childNodeIds).toEqual([]); // svg subtree is not walked
    expect(result.nodes.find((n) => n.tagName === 'rect')).toBeUndefined();
  });

  it('records external SVG image references as svg-external sources', () => {
    // <img src="*.svg" is treated as an image reference — never downloaded.
    resetDom('', '<img src="icons/logo.svg">');
    const result = capture();
    expect(result.assets[0]?.source).toBe('https://example.com/docs/icons/logo.svg');
    expect(result.assets).toHaveLength(1);
  });

  it('respects includeImages=false and includeBackgroundImages=false', () => {
    resetDom('', '<img src="a.png"><div style="background-image: url(bg.png)">x</div>');
    const result = capture({ includeImages: false, includeBackgroundImages: false });
    expect(result.assets).toHaveLength(0);
  });

  it('asset ids are sequential and reference captured nodes', () => {
    resetDom('', '<img src="a.png"><img src="b.png">');
    const result = capture();
    expect(result.assets.map((a) => a.assetId)).toEqual([0, 1]);
    for (const asset of result.assets) {
      expect(asset.nodeId).not.toBeNull();
      expect(result.nodes.some((n) => n.nodeId === asset.nodeId)).toBe(true);
    }
  });
});
