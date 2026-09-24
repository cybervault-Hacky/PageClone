import { describe, expect, it } from 'vitest';
import type { PageDetection } from '@/shared/types';
import {
  ANALYSIS_UNAVAILABLE_NOTICE,
  getCardStatus,
  getIssueHint,
  getIssueTitle,
  getStatusNote,
  toViewState,
} from '@/popup/utils/viewState';

const supported: PageDetection = {
  status: 'supported',
  page: {
    url: 'https://example.com/',
    hostname: 'example.com',
    title: 'Example',
    faviconUrl: null,
  },
};

describe('toViewState', () => {
  it('maps null to the detecting state', () => {
    expect(toViewState(null)).toEqual({ kind: 'detecting' });
  });

  it('maps supported detection to detected', () => {
    expect(toViewState(supported)).toEqual({
      kind: 'detected',
      page: supported.status === 'supported' ? supported.page : expect.anything(),
    });
  });

  it('maps unsupported detection', () => {
    expect(toViewState({ status: 'unsupported', issue: 'restricted' })).toEqual({
      kind: 'unsupported',
      issue: 'restricted',
    });
  });

  it('maps error detection', () => {
    expect(toViewState({ status: 'error', issue: 'unknown' })).toEqual({
      kind: 'error',
      issue: 'unknown',
    });
  });
});

describe('issue copy', () => {
  it('covers every issue with a short title and hint', () => {
    for (const issue of ['no-active-tab', 'restricted', 'inaccessible', 'unknown'] as const) {
      expect(getIssueTitle(issue).length).toBeGreaterThan(0);
      expect(getIssueHint(issue).length).toBeGreaterThan(0);
      // Copy must stay short — no paragraphs, no stack traces.
      expect(getIssueTitle(issue)).not.toMatch(/\n/);
      expect(getIssueHint(issue)).not.toMatch(/\n/);
    }
  });

  it('uses the agreed wording for the key states', () => {
    expect(getIssueTitle('no-active-tab')).toBe('No active page detected');
    expect(getIssueTitle('restricted')).toBe('This browser page cannot be captured');
    expect(getIssueTitle('inaccessible')).toBe('Unable to access this page');
    expect(getIssueTitle('unknown')).toBe('Something went wrong');
  });

  it('keeps a neutral tone for browser-protected pages', () => {
    expect(getIssueTitle('restricted')).not.toMatch(/error|failed|wrong/i);
  });
});

describe('getCardStatus', () => {
  const detected = toViewState(supported);

  it('shows detection status while idle', () => {
    expect(getCardStatus(detected, 'idle')).toEqual({
      tone: 'ok',
      label: 'Current page detected',
    });
    expect(getCardStatus(detected, 'detected')).toEqual({
      tone: 'ok',
      label: 'Current page detected',
    });
  });

  it('distinguishes analyzing, ready and error analysis states', () => {
    expect(getCardStatus(detected, 'analyzing')).toEqual({
      tone: 'busy',
      label: 'Analyzing page',
    });
    expect(getCardStatus(detected, 'ready')).toEqual({
      tone: 'ok',
      label: 'Analysis complete',
    });
    expect(getCardStatus(detected, 'error')).toEqual({
      tone: 'danger',
      label: 'Analysis failed',
    });
  });

  it('has no status line without a detected page', () => {
    expect(getCardStatus({ kind: 'detecting' }, 'idle')).toBeNull();
    expect(getCardStatus({ kind: 'unsupported', issue: 'restricted' }, 'idle')).toBeNull();
  });
});

describe('getStatusNote', () => {
  const detected = toViewState(supported);
  const unsupported = toViewState({ status: 'unsupported', issue: 'restricted' });

  it('shows the ready note for a detected page', () => {
    expect(getStatusNote({ view: detected, phase: 'idle', notice: null })).toBe(
      'Ready to create a standalone frontend from this page.',
    );
  });

  it('shows analysis states distinctly from plain detection', () => {
    expect(getStatusNote({ view: detected, phase: 'analyzing', notice: null })).toBe(
      'Analyzing page structure…',
    );
    expect(getStatusNote({ view: detected, phase: 'ready', notice: null })).toMatch(
      /^Analysis complete/,
    );
    expect(getStatusNote({ view: detected, phase: 'error', notice: null })).toMatch(
      /Something went wrong/,
    );
  });

  it('prioritizes an active phase over a stale notice', () => {
    expect(getStatusNote({ view: detected, phase: 'analyzing', notice: 'old notice' })).toBe(
      'Analyzing page structure…',
    );
  });

  it('shows a transient notice while idle', () => {
    expect(
      getStatusNote({ view: detected, phase: 'idle', notice: ANALYSIS_UNAVAILABLE_NOTICE }),
    ).toBe(ANALYSIS_UNAVAILABLE_NOTICE);
  });

  it('adds no footer noise for unsupported pages', () => {
    expect(getStatusNote({ view: unsupported, phase: 'idle', notice: null })).toBeNull();
    expect(getStatusNote({ view: { kind: 'detecting' }, phase: 'idle', notice: null })).toBeNull();
  });
});
