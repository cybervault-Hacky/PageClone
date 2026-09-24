import { beforeEach, describe, expect, it } from 'vitest';
import { CAPTURE_LIMITS } from '@/shared/constants/capture';
import { capture, resetDom } from './helpers/dom';

beforeEach(() => {
  resetDom();
});

function buildDom(elementCount: number): void {
  const items = Array.from({ length: elementCount }, (_, i) => `<div class="item">item ${i}</div>`);
  document.body.innerHTML = `<section>${items.join('')}</section>`;
}

describe('capture — performance limits', () => {
  it('returns a valid partial result when the element limit is reached', () => {
    buildDom(100);
    const result = capture({ maxElements: 20 });

    expect(result.statistics.elementsCaptured).toBeLessThanOrEqual(20);
    expect(result.statistics.elementsCaptured).toBeGreaterThan(0);
    expect(result.statistics.truncated).toBe(true);
    expect(result.warnings.some((w) => w.code === 'element-limit')).toBe(true);
    // tree stays connected even when partial
    expect(result.nodes[0]?.parentId).toBeNull();
  });

  it('caps per-node text length', () => {
    resetDom('', `<p>${'word '.repeat(200)}</p>`);
    const result = capture({ maxTextLength: 32 });
    const p = result.nodes.find((n) => n.tagName === 'p');
    expect((p?.text ?? '').length).toBeLessThanOrEqual(32);
  });

  it('caps total text across the document and warns', () => {
    resetDom(
      '',
      Array.from({ length: 10 }, (_, i) => `<p>${`paragraph ${i} ${'x'.repeat(100)}</p>`}`).join(
        '',
      ),
    );
    const result = capture({ maxTotalText: 150, maxTextLength: 400 });

    expect(result.statistics.textCharactersCaptured).toBeLessThanOrEqual(150);
    expect(result.statistics.truncated).toBe(true);
    expect(result.warnings.some((w) => w.code === 'text-limit')).toBe(true);
  });

  it('caps discovered assets', () => {
    resetDom('', Array.from({ length: 30 }, (_, i) => `<img src="img/${i}.png">`).join(''));
    const result = capture({ maxAssets: 5 });

    expect(result.assets.length).toBeLessThanOrEqual(5);
    expect(result.statistics.truncated).toBe(true);
    expect(result.warnings.some((w) => w.code === 'asset-limit')).toBe(true);
  });

  it('stops after the duration limit and still returns a partial result', () => {
    buildDom(500);
    let call = 0;
    const now = (): number => {
      call += 1;
      return call <= 1 ? 0 : 10_000_000; // deadline (start + 6s) exceeded immediately
    };

    const result = capture({}, { now });

    expect(result.statistics.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.statistics.truncated).toBe(true);
    expect(result.warnings.some((w) => w.code === 'duration-limit')).toBe(true);
    expect(result.nodes.length).toBeGreaterThan(0); // partial tree, not a crash
    expect(result.nodes.length).toBeLessThan(500 + 5);
  });

  it('serialized size stays within the hard cap for bounded options', () => {
    buildDom(200);
    const result = capture();
    expect(result.statistics.serializedBytes).toBeGreaterThan(0);
    expect(result.statistics.serializedBytes).toBeLessThanOrEqual(
      CAPTURE_LIMITS.maxSerializedBytes,
    );
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(CAPTURE_LIMITS.maxSerializedBytes);
  });

  it('statistics describe the run honestly', () => {
    resetDom('', '<p>Hello</p><img src="a.png"><a href="https://example.com/">l</a>');
    const result = capture();
    const s = result.statistics;

    expect(s.elementsCaptured).toBe(result.nodes.length);
    expect(s.links).toBe(result.links.length);
    expect(s.assetsDiscovered).toBe(result.assets.length);
    expect(s.images).toBe(result.assets.filter((a) => a.kind === 'image').length);
    expect(typeof s.durationMs).toBe('number');
    expect(s.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof s.truncated).toBe('boolean');
  });

  it('honours includeText=false for zero text capture', () => {
    resetDom('', '<p>some text</p>');
    const result = capture({ includeText: false });
    expect(result.statistics.textCharactersCaptured).toBe(0);
    expect(result.nodes.find((n) => n.tagName === 'p')?.text).toBeUndefined();
  });
});
