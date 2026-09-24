/**
 * Dev-only fallback: lets `npm run dev` render the popup outside an extension
 * context (no `chrome.tabs` available). Guarded by `import.meta.env.DEV`, so
 * production builds drop this module entirely.
 */
interface DevTab {
  readonly id: number;
  readonly url: string;
  readonly title: string;
}

const DEV_TABS: readonly DevTab[] = [
  {
    id: 1,
    url: 'https://developer.chrome.com/docs/extensions/reference/api/tabs',
    title: 'chrome.tabs API',
  },
];

export function ensureDevChrome(): void {
  const existing = globalThis.chrome;
  if (existing?.tabs && typeof existing.tabs.query === 'function') return;

  globalThis.chrome = {
    tabs: {
      query: async () => DEV_TABS.map((tab) => ({ ...tab })),
    },
    runtime: { id: 'pageclone-dev' },
  } as unknown as typeof chrome;
}
