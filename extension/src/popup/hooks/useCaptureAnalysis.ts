import { useCallback, useRef, useState } from 'react';
import type {
  AnalysisPhase,
  CaptureErrorCode,
  CaptureOptions,
  CaptureResult,
  PageMetadata,
} from '@/shared/types';
import { createCaptureRequestId } from '@/shared/messaging/protocol';
import { requestCapture } from '../utils/captureClient';

export interface CaptureErrorInfo {
  readonly code: CaptureErrorCode;
  readonly message: string;
}

export interface UseCaptureAnalysisResult {
  readonly phase: Extract<AnalysisPhase, 'idle' | 'analyzing' | 'ready' | 'error'>;
  readonly result: CaptureResult | null;
  readonly error: CaptureErrorInfo | null;
  /** Starts (or restarts) a capture for the given page. */
  readonly analyze: (page: PageMetadata, options?: Partial<CaptureOptions>) => void;
  /** Clears analysis state (used when the detected page changes). */
  readonly reset: () => void;
}

type CapturePhase = Extract<AnalysisPhase, 'idle' | 'analyzing' | 'ready' | 'error'>;

/**
 * Drives the real analysis flow: `idle → analyzing → ready | error`.
 * Stale responses are ignored via a per-run sequence guard.
 */
export function useCaptureAnalysis(): UseCaptureAnalysisResult {
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [error, setError] = useState<CaptureErrorInfo | null>(null);
  const runIdRef = useRef(0);

  const analyze = useCallback((page: PageMetadata, options?: Partial<CaptureOptions>) => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    setPhase('analyzing');
    setResult(null);
    setError(null);

    void requestCapture({
      requestId: createCaptureRequestId(),
      tabId: page.tabId,
      targetUrl: page.url,
      ...(options !== undefined ? { options } : {}),
    }).then((outcome) => {
      if (runIdRef.current !== runId) return; // stale response
      if (outcome.ok) {
        setResult(outcome.result);
        setPhase('ready');
        return;
      }
      setError({ code: outcome.code, message: outcome.message });
      setPhase('error');
    });
  }, []);

  const reset = useCallback(() => {
    runIdRef.current += 1; // invalidate in-flight requests
    setPhase('idle');
    setResult(null);
    setError(null);
  }, []);

  return { phase, result, error, analyze, reset };
}
