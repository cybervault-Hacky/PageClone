/**
 * Dev-only fallback: lets `npm run dev` exercise the popup outside an
 * extension context (no real `chrome.tabs` / messaging available).
 *
 * - Tab detection reports the page that is actually being previewed.
 * - Capture requests run the REAL engine against the current document, so
 *   the preview shows genuine statistics — never fabricated demo data.
 *
 * Guarded by `import.meta.env.DEV`, so production builds drop this module.
 */
export function ensureDevChrome(): void {
  const existing = globalThis.chrome;
  if (existing?.tabs && typeof existing.tabs.query === 'function') return;

  const devTab = {
    id: 1,
    url: location.href,
    title: document.title || 'PageClone preview',
    favIconUrl: undefined as string | undefined,
  };

  globalThis.chrome = {
    tabs: {
      query: async () => [{ ...devTab }],
    },
    runtime: {
      id: 'pageclone-dev',
      lastError: undefined,
      onInstalled: { addListener: () => undefined },
      onMessage: { addListener: () => undefined },
      sendMessage: async (message: unknown, callback?: (response: unknown) => void) => {
        if (callback === undefined) return;
        const { isCaptureRequestMessage } = await import('@/shared/messaging/protocol');
        if (!isCaptureRequestMessage(message)) {
          callback(undefined);
          return;
        }
        const { captureDocument } = await import('@/content/engine/capture');
        const { clampCaptureOptions, createCaptureSuccess } =
          await import('@/shared/messaging/protocol');
        // The preview page IS the document under analysis; skip identity checks.
        const result = captureDocument(clampCaptureOptions(message.options), location.href);
        callback(createCaptureSuccess(message.requestId, result));
      },
    },
  } as unknown as typeof chrome;
}
