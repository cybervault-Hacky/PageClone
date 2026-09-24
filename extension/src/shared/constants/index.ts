/** Product-level constants shared by background, content and popup. */
export const EXTENSION_NAME = 'PageClone';

/**
 * URL schemes the browser protects. PageClone never probes, injects into or
 * attempts to bypass these — they are classified as unsupported instead.
 */
export const RESTRICTED_PROTOCOLS: readonly string[] = [
  'about:',
  'chrome:',
  'chrome-extension:',
  'chrome-search:',
  'chrome-untrusted:',
  'devtools:',
  'edge:',
  'file:',
  'view-source:',
  'ws:',
  'wss:',
];

/** Extension-store front-ends are protected system pages as well. */
export const WEBSTORE_HOSTNAMES: readonly string[] = [
  'chrome.google.com',
  'chromewebstore.google.com',
  'addons.mozilla.org',
  'microsoftedge.microsoft.com',
];

/** Internal message channel names (background ⇄ content ⇄ popup). */
export const MESSAGE_CHANNELS = {
  analysis: 'pageclone:analysis',
} as const;
