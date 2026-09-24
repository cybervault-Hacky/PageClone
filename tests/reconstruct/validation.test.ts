import { beforeEach, describe, expect, it } from 'vitest';
import { resetDom } from '../helpers/dom';
import { reconstructCapture, validateReconstructionResult } from '@/shared/reconstruct';
import { RECONSTRUCTION_RESULT_VERSION } from '@/shared/constants/reconstruct';
import { fixtureSimplePage } from './fixtures';

beforeEach(() => {
  resetDom();
});

function validResult(): ReturnType<typeof reconstructCapture> {
  return reconstructCapture(fixtureSimplePage());
}

describe('reconstruction — output validation', () => {
  it('accepts genuine engine output', () => {
    const outcome = validateReconstructionResult(validResult());
    expect(outcome.ok).toBe(true);
  });

  it('rejects non-objects and wrong versions', () => {
    expect(validateReconstructionResult(null).ok).toBe(false);
    expect(validateReconstructionResult('html').ok).toBe(false);
    expect(validateReconstructionResult([]).ok).toBe(false);
    expect(validateReconstructionResult({ ...validResult(), version: 99 }).ok).toBe(false);
  });

  it('rejects results without the doctype prefix', () => {
    const result = validResult();
    expect(validateReconstructionResult({ ...result, html: '<html></html>' }).ok).toBe(false);
  });

  it('rejects raw executable elements anywhere in the output', () => {
    const result = validResult();
    for (const injection of [
      result.html.replace('<body', '<body><script>alert(1)</script>'),
      result.html.replace('<body', '<body><iframe src="https://evil.example"></iframe>'),
      result.html.replace('<body', '<body><object data="x"></object>'),
    ]) {
      expect(validateReconstructionResult({ ...result, html: injection }).ok).toBe(false);
    }
  });

  it('rejects event-handler and unknown attributes', () => {
    const result = validResult();
    expect(
      validateReconstructionResult({
        ...result,
        html: result.html.replace('<body', '<body onclick="evil()"'),
      }).ok,
    ).toBe(false);
    expect(
      validateReconstructionResult({
        ...result,
        html: result.html.replace('<body', '<body data-anything="1"'),
      }).ok,
    ).toBe(false);
  });

  it('rejects executable URL schemes in attribute values', () => {
    const result = validResult();
    expect(
      validateReconstructionResult({
        ...result,
        html: result.html.replace('<body', '<body><a href="javascript:alert(1)">x</a>'),
      }).ok,
    ).toBe(false);
    expect(
      validateReconstructionResult({
        ...result,
        html: result.html.replace('<body', '<body><img src="vbscript:x">'),
      }).ok,
    ).toBe(false);
  });

  it('rejects unbalanced or HTML-bearing CSS', () => {
    const result = validResult();
    expect(validateReconstructionResult({ ...result, css: `${result.css}<script>` }).ok).toBe(
      false,
    );
    expect(validateReconstructionResult({ ...result, css: `${result.css} .x {` }).ok).toBe(false);
    expect(
      validateReconstructionResult({ ...result, css: `${result.css} .x { color: javascript:; }` })
        .ok,
    ).toBe(false);
  });

  it('rejects statistics that disagree with the payloads', () => {
    const result = validResult();
    expect(
      validateReconstructionResult({
        ...result,
        statistics: { ...result.statistics, htmlBytes: result.statistics.htmlBytes + 1 },
      }).ok,
    ).toBe(false);
    expect(
      validateReconstructionResult({
        ...result,
        statistics: { ...result.statistics, warnings: result.statistics.warnings + 1 },
      }).ok,
    ).toBe(false);
    expect(
      validateReconstructionResult({
        ...result,
        statistics: { ...result.statistics, nodesReconstructed: -1 },
      }).ok,
    ).toBe(false);
  });

  it('rejects malformed warnings', () => {
    const result = validResult();
    expect(
      validateReconstructionResult({
        ...result,
        warnings: [{ code: 'UNKNOWN_CODE', message: 'x', count: 1 }],
      }).ok,
    ).toBe(false);
    expect(
      validateReconstructionResult({
        ...result,
        warnings: [{ code: 'UNSUPPORTED_ELEMENT', message: 'x', count: 0 }],
      }).ok,
    ).toBe(false);
  });

  it('uses a distinct schema version from the capture model', () => {
    const result = validResult();
    expect(result.version).toBe(RECONSTRUCTION_RESULT_VERSION);
    expect(result.version).toBe(1);
  });
});
