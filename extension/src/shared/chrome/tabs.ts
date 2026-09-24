import type { PageDetection, PageMetadata } from '../types';
import { getHostname, isRestrictedUrl, resolveFaviconUrl } from '../utils/url';

/** Subset of `chrome.tabs.Tab` detection relies on (keeps tests light). */
export interface DetectedTab {
  readonly id?: number;
  readonly url?: string;
  readonly title?: string;
  readonly favIconUrl?: string;
}

/** Pure classification of a tab — no Chrome APIs, fully unit-testable. */
export function classifyTab(tab: DetectedTab): PageDetection {
  const url = typeof tab.url === 'string' ? tab.url.trim() : '';
  if (url === '') return { status: 'error', issue: 'inaccessible' };
  if (isRestrictedUrl(url)) return { status: 'unsupported', issue: 'restricted' };

  const hostname = getHostname(url);
  if (hostname === null) return { status: 'error', issue: 'inaccessible' };
  if (typeof tab.id !== 'number') return { status: 'error', issue: 'inaccessible' };

  const title = typeof tab.title === 'string' ? tab.title.trim() : '';
  const page: PageMetadata = {
    tabId: tab.id,
    url,
    hostname,
    title: title === '' ? null : title,
    faviconUrl: resolveFaviconUrl(tab.favIconUrl),
  };
  return { status: 'supported', page };
}

/**
 * Detects the active tab and returns safe metadata for it.
 *
 * Requires only the `tabs` permission (URL/title/favicon of the active tab).
 * Browser-protected pages are reported as unsupported — never bypassed.
 */
export async function detectActivePage(): Promise<PageDetection> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    return { status: 'error', issue: 'unknown' };
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) return { status: 'error', issue: 'no-active-tab' };
    return classifyTab(tab);
  } catch {
    return { status: 'error', issue: 'unknown' };
  }
}
