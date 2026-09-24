import { beforeEach, describe, expect, it } from 'vitest';
import { resetDom } from '../helpers/dom';
import { reconstructCapture } from '@/shared/reconstruct';
import {
  fixtureAssetPage,
  fixtureHostileCapture,
  fixtureHostileStyles,
  fixtureInteractivePage,
  fixtureLayoutPage,
  fixtureNestedTreePage,
  fixturePseudoElements,
  fixtureSimplePage,
  fixtureSvgInline,
  fixtureTypographyPage,
} from './fixtures';

beforeEach(() => {
  resetDom();
});

const DOM_FIXTURES = [
  fixtureSimplePage,
  fixtureLayoutPage,
  fixtureTypographyPage,
  fixtureAssetPage,
  fixtureInteractivePage,
  fixtureNestedTreePage,
];

const HAND_BUILT_FIXTURES = [
  fixtureHostileCapture,
  fixtureHostileStyles,
  fixturePseudoElements,
  fixtureSvgInline,
];

describe('reconstruction — determinism', () => {
  it('twice-reconstructed DOM captures are byte-identical', () => {
    for (const build of DOM_FIXTURES) {
      const first = reconstructCapture(build());
      const second = reconstructCapture(build());
      expect(second.html).toBe(first.html);
      expect(second.css).toBe(first.css);
      expect(second.statistics).toEqual(first.statistics);
      expect(second.warnings).toEqual(first.warnings);
    }
  });

  it('twice-reconstructed hand-built captures are byte-identical', () => {
    for (const build of HAND_BUILT_FIXTURES) {
      const first = reconstructCapture(build());
      const second = reconstructCapture(build());
      expect(second.html).toBe(first.html);
      expect(second.css).toBe(first.css);
    }
  });

  it('is independent of captured object key insertion order', () => {
    const capture = fixtureHostileStyles();
    // Rebuild every styles/attributes object with reversed key order.
    const reversed: typeof capture.nodes = capture.nodes.map((node) => ({
      ...node,
      ...(node.styles !== undefined
        ? {
            styles: Object.fromEntries(Object.entries(node.styles).reverse()),
          }
        : {}),
      attributes: Object.fromEntries(Object.entries(node.attributes).reverse()),
    }));
    const a = reconstructCapture(capture);
    const b = reconstructCapture({ ...capture, nodes: reversed });
    expect(b.html).toBe(a.html);
    expect(b.css).toBe(a.css);
  });

  it('is independent of asset array ordering for svg lookup (first wins)', () => {
    const capture = fixtureSvgInline();
    const reordered = {
      ...capture,
      assets: [...capture.assets].reverse(),
    };
    expect(reconstructCapture(reordered).html).toBe(reconstructCapture(capture).html);
  });

  it('contains no timestamps, randomness or environment markers', () => {
    for (const build of [...DOM_FIXTURES, ...HAND_BUILT_FIXTURES]) {
      const result = reconstructCapture(build());
      expect(result.html).not.toMatch(/capturedAt|"now"|Date\.now/);
      expect(result.html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/); // no uuids
      expect(result.css).not.toMatch(/capturedAt/);
      // JSON round-trip must be lossless (pure data).
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });
});
