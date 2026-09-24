import { beforeEach, describe, expect, it } from 'vitest';
import { resetDom } from '../helpers/dom';
import { compareStructure, reconstructCapture } from '@/shared/reconstruct';
import {
  fixtureAssetPage,
  fixtureInteractivePage,
  fixtureLayoutPage,
  fixtureNestedTreePage,
  fixtureSimplePage,
  fixtureSvgInline,
  fixtureTypographyPage,
} from './fixtures';

beforeEach(() => {
  resetDom();
});

describe('reconstruction — structure parity', () => {
  it('fixture A: simple page keeps full structural parity', () => {
    const capture = fixtureSimplePage();
    const result = reconstructCapture(capture);
    const parity = compareStructure(capture, result.html);

    expect(parity.withinTolerance).toBe(true);
    expect(parity.tagSequenceMatches).toBe(true);
    expect(parity.textMatches).toBe(true);
    expect(parity.headingsMatch).toBe(true);
    expect(parity.interactiveMatch).toBe(true);
    expect(parity.elementRatio).toBe(1);
  });

  it('fixture B: layout page parity', () => {
    const capture = fixtureLayoutPage();
    const parity = compareStructure(capture, reconstructCapture(capture).html);
    expect(parity.withinTolerance).toBe(true);
  });

  it('fixture C: typography page parity', () => {
    const capture = fixtureTypographyPage();
    const parity = compareStructure(capture, reconstructCapture(capture).html);
    expect(parity.withinTolerance).toBe(true);
    expect(parity.headingsMatch).toBe(true);
  });

  it('fixture D: asset page parity (images + inline svg leaf)', () => {
    const capture = fixtureAssetPage();
    const parity = compareStructure(capture, reconstructCapture(capture).html);
    expect(parity.withinTolerance).toBe(true);
    expect(parity.imagesMatch).toBe(true);
  });

  it('fixture E: interactive page parity (links + controls)', () => {
    const capture = fixtureInteractivePage();
    const parity = compareStructure(capture, reconstructCapture(capture).html);
    expect(parity.withinTolerance).toBe(true);
    expect(parity.linksMatch).toBe(true);
    expect(parity.interactiveMatch).toBe(true);
  });

  it('fixture H: complex nested tree parity', () => {
    const capture = fixtureNestedTreePage();
    const parity = compareStructure(capture, reconstructCapture(capture).html);
    expect(parity.withinTolerance).toBe(true);
    expect(parity.elementRatio).toBe(1);
  });

  it('inline svg counts as one leaf element on both sides', () => {
    const capture = fixtureSvgInline();
    const result = reconstructCapture(capture);
    const parity = compareStructure(capture, result.html);
    expect(parity.capturedElements).toBe(parity.reconstructedElements);
  });

  it('reports honest mismatches when structure diverges', () => {
    const capture = fixtureSimplePage();
    const result = reconstructCapture(capture);
    // Delete an element from the generated document → parity must fail.
    const mutated = result.html.replace(/<button[\s\S]*?<\/button>/, '');
    const parity = compareStructure(capture, mutated);
    expect(parity.withinTolerance).toBe(false);
    expect(parity.tagSequenceMatches).toBe(false);
  });
});
