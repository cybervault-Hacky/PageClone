import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/popup/App';
import { reconstructCapture } from '@/shared/reconstruct';
import type { CaptureResult, PageDetection } from '@/shared/types';
import { resetDom } from './helpers/dom';
import { fixtureSimplePage } from './reconstruct/fixtures';

/**
 * Preview integration: the popup must render the REAL reconstruction engine
 * output (`CaptureResult → reconstructCapture() → html`) — never a
 * hand-built stand-in.
 */

beforeEach(() => {
  resetDom();
});

function supportedDetection(): PageDetection {
  return {
    status: 'supported',
    page: {
      tabId: 12,
      url: 'https://www.example.com/pricing',
      hostname: 'www.example.com',
      title: 'Example — Pricing',
      faviconUrl: null,
    },
  };
}

function readyCapture(): CaptureResult {
  // A REAL engine round trip: jsdom page → capture (Phase 2) is already
  // covered by Phase 2 suites; here the fixture IS a valid CaptureResult
  // built by that engine, and we reconstruct it with the Phase 3 engine.
  return fixtureSimplePage();
}

function renderReadyApp(capture: CaptureResult = readyCapture()) {
  return render(
    <App
      detection={supportedDetection()}
      analysisPhase="ready"
      captureResult={capture}
      onRefresh={vi.fn()}
      onAnalyze={vi.fn()}
    />,
  );
}

describe('popup reconstruction preview', () => {
  it('offers Reconstruct Preview after a successful analysis', () => {
    renderReadyApp();
    expect(screen.getByRole('button', { name: 'Reconstruct Preview' })).toBeInTheDocument();
  });

  it('does not offer a preview while analyzing or on error', () => {
    const { rerender } = render(
      <App
        detection={supportedDetection()}
        analysisPhase="analyzing"
        captureResult={null}
        onRefresh={vi.fn()}
        onAnalyze={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Reconstruct Preview' })).not.toBeInTheDocument();

    rerender(
      <App
        detection={supportedDetection()}
        analysisPhase="error"
        captureResult={null}
        captureError={{ message: 'Analysis failed.' }}
        onRefresh={vi.fn()}
        onAnalyze={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Reconstruct Preview' })).not.toBeInTheDocument();
  });

  it('renders the actual generated document in the sandboxed iframe', () => {
    const capture = readyCapture();
    const expected = reconstructCapture(capture);
    renderReadyApp(capture);

    fireEvent.click(screen.getByRole('button', { name: 'Reconstruct Preview' }));

    const frame = screen.getByTitle('Reconstructed page preview') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('');
    // The iframe payload IS the engine output — byte for byte.
    expect(frame.getAttribute('srcdoc')).toBe(expected.html);
    expect(frame.getAttribute('srcdoc')).toContain('<!doctype html>');
    expect(frame.getAttribute('srcdoc')).toContain('pc-n');
  });

  it('shows honest engine statistics in the preview footer', () => {
    const capture = readyCapture();
    const expected = reconstructCapture(capture);
    renderReadyApp(capture);
    fireEvent.click(screen.getByRole('button', { name: 'Reconstruct Preview' }));

    const meta = screen.getByText((_, element) => element?.className === 'preview__meta');
    expect(meta.textContent).toContain(`${expected.statistics.nodesReconstructed} nodes`);
    expect(meta.textContent).toContain(`${expected.statistics.styleRules} style rules`);
  });

  it('returns to the analysis view via Back', async () => {
    renderReadyApp();
    fireEvent.click(screen.getByRole('button', { name: 'Reconstruct Preview' }));
    expect(screen.getByTitle('Reconstructed page preview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => {
      expect(screen.queryByTitle('Reconstructed page preview')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Reconstruct Preview' })).toBeInTheDocument();
  });

  it('closes the preview when the analysis phase changes', () => {
    const { rerender } = renderReadyApp();
    fireEvent.click(screen.getByRole('button', { name: 'Reconstruct Preview' }));
    expect(screen.getByTitle('Reconstructed page preview')).toBeInTheDocument();

    rerender(
      <App
        detection={supportedDetection()}
        analysisPhase="analyzing"
        captureResult={null}
        onRefresh={vi.fn()}
        onAnalyze={vi.fn()}
      />,
    );
    expect(screen.queryByTitle('Reconstructed page preview')).not.toBeInTheDocument();
  });

  it('shows honest failure copy when reconstruction is impossible', () => {
    render(
      <App
        detection={supportedDetection()}
        analysisPhase="ready"
        captureResult={{ ...readyCapture(), version: 99 }}
        onRefresh={vi.fn()}
        onAnalyze={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reconstruct Preview' }));

    expect(screen.getByText(/Reconstruction could not produce a safe preview/)).toBeInTheDocument();
    expect(screen.queryByTitle('Reconstructed page preview')).not.toBeInTheDocument();
  });
});
