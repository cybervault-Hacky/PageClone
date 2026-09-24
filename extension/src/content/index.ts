/**
 * Content script entry point (Phase 1 skeleton).
 *
 * Not registered in manifest.json yet: Phase 1 holds no host permissions and
 * injects nothing into pages. A later phase will activate this module for
 * DOM inspection behind explicit, narrow matches.
 */
import { MESSAGE_CHANNELS } from '@/shared/constants';

export interface AnalysisRequest {
  readonly type: typeof MESSAGE_CHANNELS.analysis;
}

export function isAnalysisRequest(value: unknown): value is AnalysisRequest {
  if (typeof value !== 'object' || value === null) return false;
  return (value as { type?: unknown }).type === MESSAGE_CHANNELS.analysis;
}

function registerListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isAnalysisRequest(message)) {
      // Phase 1 has no analysis engine — respond honestly instead of faking it.
      sendResponse({ ok: false, reason: 'analysis-unavailable' });
      return true;
    }
    return false;
  });
}

// Only wire up when actually injected into a page by the browser.
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  registerListener();
}
