import { vi } from 'vitest';

/** Minimal tab shape used by the mock (mirrors chrome.tabs.Tab fields we read). */
export interface MockTab {
  readonly id?: number;
  readonly url?: string;
  readonly title?: string;
  readonly favIconUrl?: string;
}

/** Default active tab returned by the mock: a normal supported page. */
export function defaultTab(): MockTab {
  return {
    id: 12,
    url: 'https://www.example.com/pricing',
    title: 'Example — Pricing',
    favIconUrl: 'https://www.example.com/favicon.ico',
  };
}

export type MockInstalledListener = (details: {
  readonly reason: string;
  readonly previousVersion?: string;
  readonly localInstall?: boolean;
}) => void;

export type MockMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => unknown;

interface ChromeMock {
  readonly tabs: { query: ReturnType<typeof vi.fn> };
  readonly runtime: {
    readonly id: string;
    readonly onInstalled: { addListener: (listener: MockInstalledListener) => void };
    readonly onMessage: { addListener: (listener: MockMessageListener) => void };
  };
  /**
   * Plain-array listener registry. Unlike `vi.fn()` call history (which
   * Vitest clears before every test via `clearMocks`), listeners registered
   * at module-import time remain visible for assertions and invocation.
   */
  readonly listeners: {
    readonly onInstalled: MockInstalledListener[];
    readonly onMessage: MockMessageListener[];
  };
}

function createChromeMock(): ChromeMock {
  const onInstalled: MockInstalledListener[] = [];
  const onMessage: MockMessageListener[] = [];

  return {
    tabs: {
      query: vi.fn(),
    },
    runtime: {
      id: 'pageclone-test',
      onInstalled: {
        addListener: (listener) => {
          onInstalled.push(listener);
        },
      },
      onMessage: {
        addListener: (listener) => {
          onMessage.push(listener);
        },
      },
    },
    listeners: { onInstalled, onMessage },
  };
}

/**
 * The mock is stored on `globalThis` so every module-graph instance of this
 * file (setup graph vs. test graph) shares ONE mock object. Modules such as
 * background/content register listeners at import time against
 * `globalThis.chrome`; tests assert on the very same instance.
 */
const MOCK_KEY = '__pageclone_chrome_mock__';

function getOrCreateChromeMock(): ChromeMock {
  const store = globalThis as unknown as Record<string, ChromeMock | undefined>;
  const existing = store[MOCK_KEY];
  if (existing) return existing;

  const mock = createChromeMock();
  store[MOCK_KEY] = mock;
  (globalThis as unknown as Record<string, unknown>).chrome = mock;
  return mock;
}

export const chromeMock = getOrCreateChromeMock();

export function resetTabsQuery(): void {
  chromeMock.tabs.query.mockReset();
  chromeMock.tabs.query.mockResolvedValue([defaultTab()]);
}
