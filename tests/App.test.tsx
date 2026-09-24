import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/popup/App';
import { CAPTURE_RESULT_VERSION } from '@/shared/constants/capture';
import type { CaptureResult, PageDetection } from '@/shared/types';

function captureFixture(): CaptureResult {
  return {
    version: CAPTURE_RESULT_VERSION,
    capturedAt: 1_700_000_000_000,
    page: {
      url: 'https://www.example.com/pricing',
      hostname: 'www.example.com',
      title: 'Example — Pricing',
      language: 'en',
      direction: 'ltr',
      faviconUrl: null,
    },
    viewport: {
      width: 800,
      height: 600,
      devicePixelRatio: 1,
      scrollWidth: 800,
      scrollHeight: 1200,
    },
    nodes: [
      {
        nodeId: 0,
        parentId: null,
        childNodeIds: [],
        tagName: 'html',
        attributes: { lang: 'en' },
        semantic: { interactive: false, headingLevel: null },
        layout: { x: 0, y: 0, width: 800, height: 1200 },
      },
    ],
    assets: [],
    links: [],
    statistics: {
      elementsCaptured: 42,
      elementsSkipped: 0,
      images: 1,
      svgs: 0,
      styledElements: 2,
      links: 3,
      assetsDiscovered: 1,
      textCharactersCaptured: 120,
      truncated: false,
      durationMs: 42,
      serializedBytes: 512,
    },
    warnings: [],
    security: {
      cookiesAccessed: false,
      storageAccessed: false,
      passwordFieldsOmitted: 0,
      formValuesOmitted: 0,
      eventHandlerAttributesDropped: 0,
      svgScriptsRemoved: 0,
      unsafeUrlsSanitized: 0,
    },
  };
}

const detected: PageDetection = {
  status: 'supported',
  page: {
    tabId: 12,
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
    expect(screen.getByText('Ready to analyze')).toBeInTheDocument();
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
          tabId: 12,
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
    expect(screen.getByRole('status')).toHaveTextContent('Analyzing page…');
    const button = screen.getByRole('button', { name: 'Analyzing…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the ready state distinctly from page detection', () => {
    renderApp({ detection: detected, analysisPhase: 'ready' });

    expect(screen.getByText('Analysis complete')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Ready for reconstruction.');
    // Detection status is still visible alongside analysis status.
    expect(screen.queryByText('Ready to analyze')).not.toBeInTheDocument();
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

describe('App — Phase 2 analysis states', () => {
  it('does not show analysis summary before analysis completes', () => {
    renderApp({ detection: detected });
    expect(screen.queryByLabelText('Analysis results')).not.toBeInTheDocument();
  });

  it('shows real statistics after a successful analysis', () => {
    renderApp({ detection: detected, analysisPhase: 'ready', captureResult: captureFixture() });

    expect(screen.getByLabelText('Analysis results')).toBeInTheDocument();
    for (const label of ['Elements', 'Images', 'SVGs', 'Links', 'Styled', 'Assets']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('42')).toBeInTheDocument(); // elementsCaptured
    expect(screen.getByText('3')).toBeInTheDocument(); // links
    expect(screen.queryByText(/Analyzed with limitations/)).not.toBeInTheDocument();
  });

  it('shows the partial-capture notice when the result was truncated', () => {
    const partial: CaptureResult = {
      ...captureFixture(),
      statistics: { ...captureFixture().statistics, truncated: true },
    };
    renderApp({ detection: detected, analysisPhase: 'ready', captureResult: partial });
    expect(screen.getByText(/Analyzed with limitations/)).toBeInTheDocument();
  });

  it('shows canonical engine error copy with a retry action', () => {
    renderApp({
      detection: detected,
      analysisPhase: 'error',
      captureError: { message: 'The page changed during analysis. Please try again.' },
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'The page changed during analysis. Please try again.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.queryByLabelText('Analysis results')).not.toBeInTheDocument();
  });

  it('offers re-analysis after a successful run', () => {
    renderApp({ detection: detected, analysisPhase: 'ready', captureResult: captureFixture() });
    expect(screen.getByRole('button', { name: 'Analyze again' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('Ready for reconstruction.');
  });

  it('disables the button while analyzing', () => {
    renderApp({ detection: detected, analysisPhase: 'analyzing' });
    expect(screen.getByRole('button', { name: 'Analyzing…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Analyzing page…');
    expect(screen.getByText('Analyzing page')).toBeInTheDocument(); // card status chip
  });
});
