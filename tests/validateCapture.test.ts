import { describe, expect, it } from 'vitest';
import { CAPTURE_LIMITS, CAPTURE_RESULT_VERSION } from '@/shared/constants/capture';
import { validateCaptureResult } from '@/shared/validation/capture';
import { capture, resetDom } from './helpers/dom';

function engineResult() {
  resetDom('', '<p>Hello</p>');
  return capture();
}

describe('validateCaptureResult — accepts real engine output', () => {
  it('validates a fresh capture', () => {
    const result = engineResult();
    const outcome = validateCaptureResult(JSON.parse(JSON.stringify(result)));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result.version).toBe(CAPTURE_RESULT_VERSION);
  });

  it('validates a partial (truncated) capture', () => {
    resetDom('', Array.from({ length: 50 }, (_, i) => `<div class="x">${i}</div>`).join(''));
    const result = capture({ maxElements: 10 });
    expect(result.statistics.truncated).toBe(true);
    expect(validateCaptureResult(JSON.parse(JSON.stringify(result))).ok).toBe(true);
  });
});

describe('validateCaptureResult — rejects malformed payloads', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'result'],
    ['array', []],
    ['empty object', {}],
  ])('rejects %s', (_label, value) => {
    const outcome = validateCaptureResult(value);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('CAPTURE_INVALID_RESULT');
  });

  it('rejects a wrong version', () => {
    const result = { ...engineResult(), version: 999 };
    const outcome = validateCaptureResult(result);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('CAPTURE_INVALID_RESULT');
  });

  it('rejects missing required sections', () => {
    const result = engineResult() as unknown as Record<string, unknown>;
    for (const key of ['page', 'viewport', 'nodes', 'assets', 'links', 'statistics', 'security']) {
      const broken = { ...result };
      delete broken[key];
      expect(validateCaptureResult(broken).ok).toBe(false);
    }
  });

  it('rejects nodes that claim too many elements (limit)', () => {
    const result = engineResult();
    const outcome = validateCaptureResult(result, {
      ...CAPTURE_LIMITS,
      maxElements: 1, // engine produced more than the allowed cap
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('CAPTURE_LIMIT_REACHED');
  });

  it('rejects duplicate node ids / broken references', () => {
    const result = engineResult();
    const nodes = [...result.nodes];
    nodes.push({ ...nodes[0]! });
    const outcome = validateCaptureResult({ ...result, nodes });
    expect(outcome.ok).toBe(false);
  });

  it('rejects non-serializable payloads', () => {
    const result = engineResult() as unknown as Record<string, unknown>;
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    result.extra = circular;
    const outcome = validateCaptureResult(result);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('CAPTURE_SERIALIZATION_FAILED');
  });

  it('rejects results larger than the serialized size cap', () => {
    const result = engineResult();
    const outcome = validateCaptureResult(result, {
      ...CAPTURE_LIMITS,
      maxSerializedBytes: 10, // tiny cap
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('CAPTURE_LIMIT_REACHED');
  });

  it('rejects a security summary claiming storage access', () => {
    const result = engineResult();
    const outcome = validateCaptureResult({
      ...result,
      security: { ...result.security, storageAccessed: true },
    });
    expect(outcome.ok).toBe(false);
  });

  it('rejects nodes carrying oversized text', () => {
    const result = engineResult();
    const nodes = result.nodes.map((node, index) =>
      index === 0 ? { ...node, text: 'x'.repeat(CAPTURE_LIMITS.maxTextLength + 1) } : node,
    );
    expect(validateCaptureResult({ ...result, nodes }).ok).toBe(false);
  });

  it('rejects malformed statistics numbers', () => {
    const result = engineResult();
    const outcome = validateCaptureResult({
      ...result,
      statistics: { ...result.statistics, elementsCaptured: -1 },
    });
    expect(outcome.ok).toBe(false);
  });
});
