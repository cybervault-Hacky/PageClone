import type { AnalysisPhase, PageDetection, PageIssue } from '@/shared/types';
import type { StatusTone, ViewState } from '../types';

/** Shown after the user presses "Analyze Page" before an engine exists. */
export const ANALYSIS_UNAVAILABLE_NOTICE =
  'Page analysis is not available yet. It arrives in a later phase.';

/** Maps detection output (or null while loading) onto a view state. */
export function toViewState(detection: PageDetection | null): ViewState {
  if (detection === null) return { kind: 'detecting' };
  switch (detection.status) {
    case 'supported':
      return { kind: 'detected', page: detection.page };
    case 'unsupported':
      return { kind: 'unsupported', issue: detection.issue };
    case 'error':
      return { kind: 'error', issue: detection.issue };
  }
}

/** Short, non-technical error titles. Never raw stack traces. */
export function getIssueTitle(issue: PageIssue): string {
  switch (issue) {
    case 'no-active-tab':
      return 'No active page detected';
    case 'restricted':
      return 'This browser page cannot be captured';
    case 'inaccessible':
      return 'Unable to access this page';
    case 'unknown':
      return 'Something went wrong';
  }
}

/** One-line explanation beneath the error title. */
export function getIssueHint(issue: PageIssue): string {
  switch (issue) {
    case 'no-active-tab':
      return 'Open a regular website tab, then reopen PageClone.';
    case 'restricted':
      return 'Browser system pages, settings and the extension store are protected.';
    case 'inaccessible':
      return 'This tab did not share any page details with PageClone.';
    case 'unknown':
      return 'Close the popup and try again.';
  }
}

/** Restricted pages are not the user's fault — keep the tone neutral. */
export function getIssueTone(issue: PageIssue): 'neutral' | 'danger' {
  return issue === 'unknown' ? 'danger' : 'neutral';
}

/** Status line shown inside the page card for a detected page. */
export function getCardStatus(
  view: ViewState,
  phase: AnalysisPhase,
): { tone: StatusTone; label: string } | null {
  if (view.kind !== 'detected') return null;
  switch (phase) {
    case 'analyzing':
      return { tone: 'busy', label: 'Analyzing page' };
    case 'ready':
      return { tone: 'ok', label: 'Analysis complete' };
    case 'error':
      return { tone: 'danger', label: 'Analysis failed' };
    default:
      return { tone: 'ok', label: 'Current page detected' };
  }
}

/**
 * Footer note beneath the primary action. Priority: active analysis phase →
 * transient notice → view-based default.
 */
export function getStatusNote(input: {
  readonly view: ViewState;
  readonly phase: AnalysisPhase;
  readonly notice: string | null;
}): string | null {
  const { view, phase, notice } = input;
  if (phase === 'analyzing') return 'Analyzing page structure…';
  if (phase === 'ready') return 'Analysis complete. Reconstruction runs in a later release.';
  if (phase === 'error') return 'Something went wrong while analyzing this page.';
  if (notice !== null) return notice;
  if (view.kind === 'detected') return 'Ready to create a standalone frontend from this page.';
  return null;
}
