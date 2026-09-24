import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useActivePage } from './hooks/useActivePage';
import './styles/index.css';

function Root() {
  const { detection, refresh } = useActivePage();
  return <App detection={detection} onRefresh={refresh} />;
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
