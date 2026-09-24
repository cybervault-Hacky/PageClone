import { useCallback, useEffect, useState } from 'react';
import type { AnalysisPhase, PageDetection } from '@/shared/types';
import { Header } from './components/Header';
import { IconRefresh } from './components/Icons';
import { PageCard } from './components/PageCard';
import { PrimaryAction } from './components/PrimaryAction';
import { StatusNote } from './components/StatusNote';
import { ANALYSIS_UNAVAILABLE_NOTICE, getStatusNote, toViewState } from './utils/viewState';

export interface AppProps {
  /** Detection result — null while the first request is in flight. */
  readonly detection: PageDetection | null;
  /** Driven by the future analysis engine; defaults to Phase 1's `idle`. */
  readonly analysisPhase?: AnalysisPhase;
  readonly onRefresh: () => void;
  /** Reserved for the Phase 2 engine; when omitted the button says so. */
  readonly onAnalyze?: () => void;
}

export function App({ detection, analysisPhase = 'idle', onRefresh, onAnalyze }: AppProps) {
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

  const note = getStatusNote({ view, phase: analysisPhase, notice });

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
