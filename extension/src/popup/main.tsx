import { StrictMode, useCallback, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useActivePage } from './hooks/useActivePage';
import { useCaptureAnalysis } from './hooks/useCaptureAnalysis';
import './styles/index.css';

function Root() {
  const { detection, refresh } = useActivePage();
  const capture = useCaptureAnalysis();

  const page = detection?.status === 'supported' ? detection.page : null;
  const pageKey = page !== null ? `${page.tabId}:${page.url}` : '';

  // A different detected page invalidates any previous analysis.
  useEffect(() => {
    capture.reset();
    // `capture.reset` is stable (useCallback with []).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  const handleRefresh = useCallback(() => {
    capture.reset();
    refresh();
  }, [capture, refresh]);

  const handleAnalyze = useCallback(() => {
    if (page !== null) capture.analyze(page);
  }, [capture, page]);

  return (
    <App
      detection={detection}
      analysisPhase={capture.phase}
      captureResult={capture.result}
      captureError={capture.error}
      onRefresh={handleRefresh}
      onAnalyze={handleAnalyze}
    />
  );
}

async function bootstrap(): Promise<void> {
  if (import.meta.env.DEV) {
    const { ensureDevChrome } = await import('./dev/ensureDevChrome');
    ensureDevChrome();
  }

  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('PageClone popup root element is missing.');

  createRoot(rootElement).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}

void bootstrap();
