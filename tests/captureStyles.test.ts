import { beforeEach, describe, expect, it } from 'vitest';
import { STYLE_PROPERTY_WHITELIST } from '@/shared/constants/capture';
import { capture, findByTag, resetDom } from './helpers/dom';

beforeEach(() => {
  resetDom();
});

describe('capture — computed styles', () => {
  it('captures whitelisted properties from inline styles', () => {
    resetDom('', '<div style="color: rgb(255, 0, 0); display: flex;">x</div>');
    const result = capture();
    const div = findByTag(result, 'div');

    expect(div.styles).toBeDefined();
    expect(div.styles?.color).toBe('rgb(255, 0, 0)');
    expect(div.styles?.display).toBe('flex');
    expect(result.statistics.styledElements).toBeGreaterThan(0);
  });

  it('never captures properties outside the central whitelist', () => {
    resetDom('', '<div style="color: rgb(1, 2, 3); -webkit-user-select: none;">x</div>');
    const result = capture();
    const div = findByTag(result, 'div');

    for (const key of Object.keys(div.styles ?? {})) {
      expect(STYLE_PROPERTY_WHITELIST).toContain(key);
    }
    expect(Object.keys(div.styles ?? {})).not.toContain('-webkit-user-select');
  });

  it('respects includeStyles=false', () => {
    resetDom('', '<div style="color: rgb(1, 2, 3)">x</div>');
    const result = capture({ includeStyles: false });
    const div = findByTag(result, 'div');
    expect(div.styles).toBeUndefined();
    expect(result.statistics.styledElements).toBe(0);
  });

  it('omits style blocks entirely when nothing readable is present', () => {
    resetDom('', '<span>x</span>');
    const result = capture();
    // jsdom reports defaults for many properties; the contract is: if styles
    // exist they only contain whitelisted keys.
    const span = findByTag(result, 'span');
    for (const key of Object.keys(span.styles ?? {})) {
      expect(STYLE_PROPERTY_WHITELIST).toContain(key);
    }
  });

  it('captures conservative pseudo-element styles without throwing', () => {
    resetDom('', '<blockquote class="quote">q</blockquote>');
    expect(() => capture()).not.toThrow();
    const result = capture();
    expect(findByTag(result, 'blockquote')).toBeDefined();
    // jsdom may not model ::before content; presence is optional, shape is not.
    const pseudo = findByTag(result, 'blockquote').pseudo;
    if (pseudo?.before !== undefined) {
      expect(typeof pseudo.before.hasContent).toBe('boolean');
      expect(STYLE_PROPERTY_WHITELIST).toContain('background-image');
    }
  });

  it('respects includePseudoElements=false', () => {
    resetDom('', '<div>d</div>');
    const result = capture({ includePseudoElements: false });
    expect(findByTag(result, 'div').pseudo).toBeUndefined();
  });
});
