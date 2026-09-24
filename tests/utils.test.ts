import { describe, expect, it } from 'vitest';
import { cx } from '@/popup/utils/cx';
import { parseUrl } from '@/shared/utils/url';

describe('cx', () => {
  it('joins truthy class names', () => {
    expect(cx('a', 'b')).toBe('a b');
    expect(cx('a', undefined, 'b', null, false, 'c')).toBe('a b c');
    expect(cx('', 'a')).toBe('a');
    expect(cx()).toBe('');
  });
});

describe('parseUrl', () => {
  it('parses valid URLs', () => {
    expect(parseUrl('https://example.com/x')?.hostname).toBe('example.com');
  });

  it('returns null instead of throwing', () => {
    expect(parseUrl('%%%')).toBeNull();
    expect(parseUrl('')).toBeNull();
  });
});
