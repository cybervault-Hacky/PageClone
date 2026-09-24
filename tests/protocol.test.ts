import { describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_OPTIONS, STYLE_PROPERTY_WHITELIST } from '@/shared/constants/capture';
import {
  captureErrorMessage,
  clampCaptureOptions,
  createCaptureFailure,
  createCaptureFailure as failure,
  createCaptureRequestId,
  createCaptureSuccess,
  isCaptureChannelMessage,
  isCaptureRequestMessage,
  isCaptureResponseMessage,
} from '@/shared/messaging/protocol';
import type { CaptureErrorCode } from '@/shared/types';
import { MESSAGE_CHANNELS } from '@/shared/constants';

const validRequest = {
  channel: MESSAGE_CHANNELS.capture,
  type: 'capture-request',
  requestId: 'cap-abc-1',
  tabId: 3,
  targetUrl: 'https://example.com/page',
};

describe('protocol — request guard', () => {
  it('accepts a well-formed request', () => {
    expect(isCaptureRequestMessage(validRequest)).toBe(true);
  });

  it.each([
    ['null', null],
    ['string', 'capture-request'],
    ['array', []],
    ['missing channel', { ...validRequest, channel: 'other' }],
    ['missing type', { ...validRequest, type: 'capture' }],
    ['empty requestId', { ...validRequest, requestId: '' }],
    ['oversized requestId', { ...validRequest, requestId: 'x'.repeat(200) }],
    ['negative tabId', { ...validRequest, tabId: -1 }],
    ['fractional tabId', { ...validRequest, tabId: 1.5 }],
    ['string tabId', { ...validRequest, tabId: '3' }],
    ['unparseable targetUrl', { ...validRequest, targetUrl: 'not a url' }],
    ['oversized targetUrl', { ...validRequest, targetUrl: `https://e.com/${'a'.repeat(5000)}` }],
    ['non-object options', { ...validRequest, options: 'x' }],
  ])('rejects %s', (_label, value) => {
    expect(isCaptureRequestMessage(value)).toBe(false);
  });

  it('accepts options objects (they are clamped later)', () => {
    expect(isCaptureRequestMessage({ ...validRequest, options: { maxElements: 10 } })).toBe(true);
  });
});

describe('protocol — response guard', () => {
  const requestId = 'cap-abc-1';

  it('accepts success and failure envelopes', () => {
    const ok = createCaptureSuccess(requestId, {} as never);
    expect(isCaptureResponseMessage(ok)).toBe(true);
    const bad = createCaptureFailure(requestId, 'CAPTURE_TIMEOUT');
    expect(isCaptureResponseMessage(bad)).toBe(true);
  });

  it.each([
    ['missing requestId', { ...failure(requestId, 'CAPTURE_TIMEOUT'), requestId: '' }],
    ['missing code', { ...failure(requestId, 'CAPTURE_TIMEOUT'), code: undefined }],
    ['array result', { ...createCaptureSuccess(requestId, [] as never), result: [] }],
    ['non-boolean ok', { ...failure(requestId, 'CAPTURE_FAILED'), ok: 'yes' }],
  ])('rejects %s', (_label, value) => {
    expect(isCaptureResponseMessage(value)).toBe(false);
  });
});

describe('protocol — channel check', () => {
  it('matches only the capture channel', () => {
    expect(isCaptureChannelMessage(validRequest)).toBe(true);
    expect(isCaptureChannelMessage({ channel: 'pageclone:analysis' })).toBe(false);
    expect(isCaptureChannelMessage(null)).toBe(false);
  });
});

describe('protocol — options clamping', () => {
  it('returns defaults for hostile/missing input', () => {
    expect(clampCaptureOptions(undefined)).toEqual(DEFAULT_CAPTURE_OPTIONS);
    expect(clampCaptureOptions('evil')).toEqual(DEFAULT_CAPTURE_OPTIONS);
    expect(clampCaptureOptions([1, 2])).toEqual(DEFAULT_CAPTURE_OPTIONS);
  });

  it('clamps numbers into hard limits', () => {
    const options = clampCaptureOptions({
      maxElements: 10_000_000,
      maxAssets: -5,
      maxTextLength: 1.7,
      maxTotalText: Number.NaN,
    });
    expect(options.maxElements).toBe(DEFAULT_CAPTURE_OPTIONS.maxElements);
    expect(options.maxAssets).toBe(1);
    expect(options.maxTextLength).toBe(2);
    expect(options.maxTotalText).toBe(DEFAULT_CAPTURE_OPTIONS.maxTotalText);
  });

  it('keeps booleans but ignores unknown keys', () => {
    const options = clampCaptureOptions({
      includeText: false,
      evil: 'x',
      __proto__: { polluted: true },
    });
    expect(options.includeText).toBe(false);
    expect('evil' in options).toBe(false);
  });

  it('ignores non-boolean values for feature flags', () => {
    expect(clampCaptureOptions({ includeStyles: 'yes' }).includeStyles).toBe(true);
  });
});

describe('protocol — error messages', () => {
  it('covers every error code with short human copy', () => {
    const codes: CaptureErrorCode[] = [
      'CAPTURE_UNAVAILABLE',
      'CAPTURE_TIMEOUT',
      'CAPTURE_LIMIT_REACHED',
      'CAPTURE_INVALID_RESULT',
      'CAPTURE_INVALID_REQUEST',
      'CAPTURE_PAGE_CHANGED',
      'CAPTURE_PERMISSION_DENIED',
      'CAPTURE_SERIALIZATION_FAILED',
      'CAPTURE_FAILED',
    ];
    for (const code of codes) {
      const message = captureErrorMessage(code);
      expect(message.length).toBeGreaterThan(10);
      expect(message.length).toBeLessThanOrEqual(160);
      expect(message).not.toMatch(/\n|at \w+|Error:|\/home\//);
    }
  });
});

describe('protocol — request ids', () => {
  it('generates unique bounded ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createCaptureRequestId()));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id.startsWith('cap-')).toBe(true);
      expect(id.length).toBeLessThanOrEqual(128);
    }
  });
});

describe('protocol — style whitelist sanity', () => {
  it('is unique and contains the core layout/visual properties', () => {
    expect(new Set(STYLE_PROPERTY_WHITELIST).size).toBe(STYLE_PROPERTY_WHITELIST.length);
    for (const prop of ['display', 'color', 'font-size', 'grid-template-columns', 'transform']) {
      expect(STYLE_PROPERTY_WHITELIST).toContain(prop);
    }
  });
});
