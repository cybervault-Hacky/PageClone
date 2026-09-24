import { beforeEach, describe, expect, it } from 'vitest';
import { resetDom } from '../helpers/dom';
import {
  DEFAULT_RECONSTRUCTION_OPTIONS,
  reconstructCapture,
  resolveReconstructionOptions,
  ReconstructionInputError,
  generatedClassName,
} from '@/shared/reconstruct';
import { CAPTURE_RESULT_VERSION } from '@/shared/constants/capture';
import { fixtureSimplePage } from './fixtures';

beforeEach(() => {
  resetDom();
});

describe('reconstruction — high-level API', () => {
  it('validates its input and throws a typed error on invalid captures', () => {
    expect(() => reconstructCapture({} as never)).toThrow(ReconstructionInputError);
    expect(() => reconstructCapture({ ...fixtureSimplePage(), version: 99 })).toThrow(
      ReconstructionInputError,
    );

    const tampered = fixtureSimplePage();
    const broken = {
      ...tampered,
      nodes: tampered.nodes.map((node, index) => (index === 1 ? { ...node, parentId: 999 } : node)),
    };
    expect(() => reconstructCapture(broken)).toThrow(ReconstructionInputError);
    try {
      reconstructCapture(broken);
    } catch (error) {
      expect(error).toBeInstanceOf(ReconstructionInputError);
      expect((error as ReconstructionInputError).code).toBe('RECONSTRUCTION_INVALID_INPUT');
    }
  });

  it('rejects captures from a different schema version', () => {
    const capture = { ...fixtureSimplePage(), version: CAPTURE_RESULT_VERSION + 1 };
    expect(() => reconstructCapture(capture)).toThrow(ReconstructionInputError);
  });

  it('returns a JSON-serializable result with the documented shape', () => {
    const result = reconstructCapture(fixtureSimplePage());
    expect(Object.keys(result).sort()).toEqual([
      'css',
      'html',
      'statistics',
      'version',
      'warnings',
    ]);
    expect(typeof result.html).toBe('string');
    expect(typeof result.css).toBe('string');
    const round = JSON.parse(JSON.stringify(result)) as typeof result;
    expect(round).toEqual(result);
  });

  it('exposes the documented statistics fields', () => {
    const result = reconstructCapture(fixtureSimplePage());
    expect(Object.keys(result.statistics).sort()).toEqual([
      'attributesReconstructed',
      'cssBytes',
      'elementsUnwrapped',
      'htmlBytes',
      'nodesReconstructed',
      'nodesSkipped',
      'pseudoElementsReconstructed',
      'styleRules',
      'stylesReconstructed',
      'svgInlineReconstructed',
      'textNodesReconstructed',
      'warnings',
    ]);
    expect(result.statistics.htmlBytes).toBe(new TextEncoder().encode(result.html).length);
    expect(result.statistics.cssBytes).toBe(new TextEncoder().encode(result.css).length);
  });

  it('resolves options against safe defaults and ignores junk', () => {
    expect(resolveReconstructionOptions(undefined)).toEqual(DEFAULT_RECONSTRUCTION_OPTIONS);
    expect(
      resolveReconstructionOptions({
        includeStyles: false,
        includeStylesJunk: 'x',
        maxElements: -5,
      } as never),
    ).toEqual({ ...DEFAULT_RECONSTRUCTION_OPTIONS, includeStyles: false });
  });

  it('generates stable deterministic identifiers', () => {
    expect(generatedClassName(0)).toBe('pc-n0');
    expect(generatedClassName(42)).toBe('pc-n42');
    const result = reconstructCapture(fixtureSimplePage());
    // node ids map to classes 1:1 — html is always pc-n0.
    expect(result.html).toContain('class="pc-n0"');
  });

  it('is safe to call concurrently (no shared state)', () => {
    const capture = fixtureSimplePage();
    const [a, b] = [reconstructCapture(capture), reconstructCapture(capture)];
    expect(a).toEqual(b);
  });
});
