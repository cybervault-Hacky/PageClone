import { useCallback, useEffect, useState } from 'react';
import { detectActivePage } from '@/shared/chrome/tabs';
import type { PageDetection } from '@/shared/types';

export interface UseActivePageResult {
  /** null while the first detection request is in flight. */
  readonly detection: PageDetection | null;
  /** Re-runs detection (e.g. after the user switched tabs). */
  readonly refresh: () => void;
}

/**
 * Runs current-tab detection when the popup opens and exposes a manual
 * refresh. Detection logic lives in `@/shared/chrome` so this hook stays a
 * thin UI binding.
 */
export function useActivePage(): UseActivePageResult {
  const [detection, setDetection] = useState<PageDetection | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDetection(null);

    void detectActivePage().then((result) => {
      if (!cancelled) setDetection(result);
    });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  return { detection, refresh };
}
