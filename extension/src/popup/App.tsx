import { useCallback, useEffect, useState } from 'react';
import type { AnalysisPhase, CaptureResult, PageDetection } from '@/shared/types';
import { AnalysisSummary } from './components/AnalysisSummary';
import { Header } from './components/Header';
import { IconRefresh } from './components/Icons';
import { PageCard } from './components/PageCard';
import { PrimaryAction } from './components/PrimaryAction';
import { StatusNote } from './components/StatusNote';
import { ANALYSIS_UNAVAILABLE_NOTICE, getStatusNote, toViewState } from './utils/viewState';

export interface AppErrorInfo {
  readonly message: string;
}

export interface AppProps {
  /** Detection result — null while the first request is in flight. */
  readonly detection: PageDetection | null;
  /** Driven by the capture engine (`useCaptureAnalysis`). */
  readonly analysisPhase?: AnalysisPhase;
  /** Successful capture statistics shown in the ready state. */
  readonly captureResult?: CaptureResult | null;
  /** Canonical failure copy shown in the error state. */
  readonly captureError?: AppErrorInfo | null;
  readonly onRefresh: () => void;
  /** Starts a capture; when omitted the button explains it is unavailable. */
  readonly onAnalyze?: () => void;
}

export function App({
  detection,
  analysisPhase = 'idle',
  captureResult = null,
  captureError = null,
  onRefresh,
  onAnalyze,
}: AppProps) {
  const view = toViewState(detection);
  const [notice, setNotice] = useState<string | null>(null);
  const viewKind = view.kind;

  // A new view/phase invalidates any stale click notice.
  useEffect(() => {
    setNotice(null);
  }, [viewKind, analysisPhase]);

  const handleAnalyze = useCallback(() => {
    if (onAnalyze) {
      onAnalyze();
      return;
    }
    setNotice(ANALYSIS_UNAVAILABLE_NOTICE);
  }, [onAnalyze]);

  const note = getStatusNote({
    view,
    phase: analysisPhase,
    notice,
    errorMessage: captureError?.message ?? null,
  });

  const showSummary = analysisPhase === 'ready' && captureResult !== null;

  return (
    <div className="app-shell">
      <Header />

      <main className="app-main">
        <p className="lede">Capture the frontend of this page as a standalone project.</p>

        <section className="section" aria-labelledby="current-page-heading">
          <h2 id="current-page-heading" className="section-label">
            Current page
          </h2>
          <PageCard view={view} phase={analysisPhase} />
        </section>

        {showSummary && <AnalysisSummary result={captureResult} />}

        <PrimaryAction view={view} phase={analysisPhase} onAnalyze={handleAnalyze} />
        <StatusNote text={note} />
      </main>

      <footer className="app-footer">
        <button type="button" className="link-button" onClick={onRefresh}>
          <IconRefresh width={12} height={12} />
          <span>Refresh</span>
        </button>
      </footer>
    </div>
  );
}
