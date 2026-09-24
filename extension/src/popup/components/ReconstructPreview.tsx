import { useMemo } from 'react';
import type { CaptureResult } from '@/shared/types';
import { buildReconstructionPreview } from '../utils/reconstructClient';
import { IconAlert, IconClone } from './Icons';

export interface ReconstructPreviewProps {
  /** Validated capture result from a completed analysis. */
  readonly result: CaptureResult;
  readonly onClose: () => void;
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Controlled reconstruction preview: renders the ACTUAL engine output —
 * `CaptureResult → reconstructCapture() → html` — inside a sandboxed iframe.
 * Nothing on screen is hand-built React; if the engine cannot produce a
 * valid document, the pane says so instead of faking it.
 */
export function ReconstructPreview({ result, onClose }: ReconstructPreviewProps) {
  const preview = useMemo(() => buildReconstructionPreview(result), [result]);

  return (
    <section className="preview" aria-label="Reconstruction preview">
      <div className="preview__toolbar">
        <button type="button" className="link-button" onClick={onClose}>
          <span aria-hidden="true">‹</span>
          <span>Back</span>
        </button>
        <p className="preview__title">
          <IconClone width={13} height={13} />
          <span>Reconstructed preview</span>
        </p>
      </div>

      {preview.ok ? (
        <>
          <iframe
            className="preview__frame"
            title="Reconstructed page preview"
            srcDoc={preview.html}
            sandbox=""
            referrerPolicy="no-referrer"
          />
          <p className="preview__meta">
            {formatCount(preview.statistics.nodesReconstructed)} nodes ·{' '}
            {formatCount(preview.statistics.styleRules)} style rules ·{' '}
            {formatCount(Math.round(preview.statistics.htmlBytes / 1024))} KB
            {preview.warningCount > 0 && (
              <span className="preview__warnings">
                {' '}
                · {formatCount(preview.warningCount)} reconstruction warnings
              </span>
            )}
          </p>
        </>
      ) : (
        <div className="preview__failure" role="status">
          <span className="issue__icon issue__icon--danger">
            <IconAlert width={16} height={16} />
          </span>
          <p>{preview.message}</p>
        </div>
      )}
    </section>
  );
}
