import { beforeEach, describe, expect, it } from 'vitest';
import { capture, findByTag, resetDom } from './helpers/dom';

beforeEach(() => {
  resetDom();
});

describe('capture — links', () => {
  it('captures link metadata with absolute hrefs', () => {
    resetDom('', '<a href="/about" target="_blank" rel="noreferrer">About us</a>');
    const result = capture();

    expect(result.links).toHaveLength(1);
    const link = result.links[0];
    expect(link?.href).toBe('https://example.com/about');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toBe('noreferrer');
    expect(link?.text).toBe('About us');
    expect(link?.nodeId).toBe(findByTag(result, 'a').nodeId);
    expect(result.statistics.links).toBe(1);
  });

  it('keeps absolute and mailto links', () => {
    resetDom('', '<a href="https://other.test/x">ext</a><a href="mailto:hi@example.com">mail</a>');
    const result = capture();
    const hrefs = result.links.map((l) => l.href);
    expect(hrefs).toContain('https://other.test/x');
    expect(hrefs).toContain('mailto:hi@example.com');
  });

  it('drops javascript: hrefs entirely', () => {
    resetDom('', '<a href="javascript:alert(1)">bad</a>');
    const result = capture();
    // attribute itself was sanitized away → no link reference is recorded
    expect(result.links).toHaveLength(0);
    expect(findByTag(result, 'a').attributes.href).toBeUndefined();
  });

  it('never follows or crawls links — capture stays single-document', () => {
    resetDom('', '<a href="/other-page">go</a><a href="/second">two</a>');
    const result = capture();
    expect(result.nodes.every((n) => n.tagName !== 'html' || n.parentId === null)).toBe(true);
    // only the current document's nodes exist
    expect(result.nodes.filter((n) => n.tagName === 'html')).toHaveLength(1);
    expect(result.page.url).toBe('https://example.com/docs/page');
  });

  it('respects includeLinks=false (attributes still structurally captured)', () => {
    resetDom('', '<a href="/x">x</a>');
    const result = capture({ includeLinks: false });
    expect(result.links).toHaveLength(0);
    expect(findByTag(result, 'a').attributes.href).toBe('https://example.com/x');
  });
});
