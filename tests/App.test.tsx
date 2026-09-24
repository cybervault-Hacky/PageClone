import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/popup/App';
import type { PageDetection } from '@/shared/types';

const detected: PageDetection = {
  status: 'supported',
  page: {
    url: 'https://www.example.com/pricing',
    hostname: 'www.example.com',
    title: 'Example — Pricing',
    faviconUrl: 'https://www.example.com/favicon.ico',
  },
};

function renderApp(props: Partial<React.ComponentProps<typeof App>> = {}) {
  const onRefresh = props.onRefresh ?? vi.fn();
  const utils = render(<App detection={null} onRefresh={onRefresh} {...props} />);
  return { ...utils, onRefresh };
}

describe('App — structure and accessibility', () => {
  it('renders a single h1 with the product name', () => {
    renderApp({ detection: detected });
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('PageClone');
  });

  it('labels the current-page section for assistive tech', () => {
    renderApp({ detection: detected });
    expect(screen.getByRole('heading', { name: 'Current page', level: 2 })).toBeInTheDocument();
  });

  it('exposes labelled buttons', () => {
    renderApp({ detection: detected });
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze Page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('uses semantic landmarks', () => {
    renderApp({ detection: detected });
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('announces status changes through a live region', () => {
    renderApp({ detection: detected });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ready to create a standalone frontend from this page.',
    );
  });
});

describe('App — UI states', () => {
  it('shows the detecting state while detection is pending', () => {
    renderApp({ detection: null });

    expect(screen.getByText('Detecting current page…')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Detecting page…' });
    expect(button).toBeDisabled();
  });

  it('shows the detected page with hostname and favicon', () => {
    renderApp({ detection: detected });

    // www. is stripped for display.
    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.getByText('Current page detected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze Page' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ready to create a standalone frontend from this page.',
    );

    const favicon = document.querySelector('img.favicon');
    expect(favicon).not.toBeNull();
    expect(favicon?.getAttribute('src')).toBe('https://www.example.com/favicon.ico');
    expect(favicon?.getAttribute('alt')).toBe('');
  });

  it('falls back to a globe icon when the favicon is missing', () => {
    renderApp({
      detection: {
        status: 'supported',
        page: {
          url: 'https://www.example.com/',
          hostname: 'www.example.com',
          title: 'Example',
          faviconUrl: null,
        },
      },
    });

    expect(document.querySelector('img.favicon')).toBeNull();
    expect(document.querySelector('.favicon--fallback')).not.toBeNull();
  });

  it('falls back when the favicon image fails to load', () => {
    renderApp({ detection: detected });
    const img = document.querySelector('img.favicon');
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(document.querySelector('img.favicon')).toBeNull();
    expect(document.querySelector('.favicon--fallback')).not.toBeNull();
  });

  it('shows the unsupported state for browser pages', () => {
    renderApp({ detection: { status: 'unsupported', issue: 'restricted' } });

    expect(screen.getByText('This browser page cannot be captured')).toBeInTheDocument();
    expect(
      screen.getByText(/system pages, settings and the extension store are protected/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze Page' })).toBeDisabled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows the no-active-tab state', () => {
    renderApp({ detection: { status: 'error', issue: 'no-active-tab' } });
    expect(screen.getByText('No active page detected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze Page' })).toBeDisabled();
  });

  it('shows the inaccessible-page state', () => {
    renderApp({ detection: { status: 'error', issue: 'inaccessible' } });
    expect(screen.getByText('Unable to access this page')).toBeInTheDocument();
  });

  it('shows a short generic error without stack traces', () => {
    renderApp({ detection: { status: 'error', issue: 'unknown' } });
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Close the popup and try again.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Error:|at \w+\.|boom/);
  });

  it('shows the analyzing state distinctly from plain detection', () => {
    renderApp({ detection: detected, analysisPhase: 'analyzing' });

    expect(screen.getByText('Analyzing page')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Analyzing page structure…');
    const button = screen.getByRole('button', { name: 'Analyzing…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the ready state distinctly from page detection', () => {
    renderApp({ detection: detected, analysisPhase: 'ready' });

    expect(screen.getByText('Analysis complete')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Analysis complete\./);
    // Detection status is still visible alongside analysis status.
    expect(screen.queryByText('Current page detected')).not.toBeInTheDocument();
  });

  it('shows the analysis error state', () => {
    renderApp({ detection: detected, analysisPhase: 'error' });
    expect(screen.getByText('Analysis failed')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Something went wrong/);
  });
});

describe('App — interactions', () => {
  it('gives honest feedback when Analyze is pressed before the engine exists', async () => {
    renderApp({ detection: detected });

    fireEvent.click(screen.getByRole('button', { name: 'Analyze Page' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Page analysis is not available yet. It arrives in a later phase.',
    );
  });

  it('delegates to onAnalyze when provided', () => {
    const onAnalyze = vi.fn();
    renderApp({ detection: detected, onAnalyze });

    fireEvent.click(screen.getByRole('button', { name: 'Analyze Page' }));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).not.toHaveTextContent('not available yet');
  });

  it('re-runs detection when Refresh is pressed', () => {
    const { onRefresh } = renderApp({ detection: detected });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
