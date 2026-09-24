import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useActivePage } from '@/popup/hooks/useActivePage';
import { chromeMock } from './chromeMock';

describe('useActivePage', () => {
  it('starts in the detecting state and resolves supported metadata', async () => {
    const { result } = renderHook(() => useActivePage());

    expect(result.current.detection).toBeNull();

    await waitFor(() => expect(result.current.detection).not.toBeNull());
    expect(result.current.detection).toMatchObject({
      status: 'supported',
      page: { hostname: 'www.example.com' },
    });
  });

  it('surfaces unsupported pages from the browser', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'chrome://settings/' }]);

    const { result } = renderHook(() => useActivePage());
    await waitFor(() => expect(result.current.detection).not.toBeNull());

    expect(result.current.detection).toEqual({ status: 'unsupported', issue: 'restricted' });
  });

  it('re-runs detection on refresh', async () => {
    const { result } = renderHook(() => useActivePage());
    await waitFor(() => expect(result.current.detection).not.toBeNull());

    const callsBefore = chromeMock.tabs.query.mock.calls.length;
    act(() => result.current.refresh());

    // Back to detecting while the new request is in flight.
    expect(result.current.detection).toBeNull();
    await waitFor(() => expect(chromeMock.tabs.query.mock.calls.length).toBe(callsBefore + 1));
    await waitFor(() => expect(result.current.detection).not.toBeNull());
  });

  it('ignores results after unmount (no state updates)', async () => {
    let resolveQuery: (tabs: unknown[]) => void = () => undefined;
    chromeMock.tabs.query.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
    );

    const { result, unmount } = renderHook(() => useActivePage());
    unmount();
    resolveQuery([]);

    // Give the promise a tick to settle; an update would trigger act warnings.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.detection).toBeNull();
  });
});
