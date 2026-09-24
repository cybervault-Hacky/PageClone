import { useState } from 'react';
import type { AnalysisPhase } from '@/shared/types';
import { getDisplayHostname } from '@/shared/utils/url';
import type { ViewState } from '../types';
import { cx } from '../utils/cx';
import { getCardStatus, getIssueHint, getIssueTitle, getIssueTone } from '../utils/viewState';
import { IconAlert, IconGlobe } from './Icons';
import { Spinner } from './Spinner';
import { StatusIndicator } from './StatusIndicator';

function Favicon({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);

  if (src === null || failed) {
    return (
      <span className="favicon favicon--fallback">
        <IconGlobe width={16} height={16} />
      </span>
    );
  }

  return (
    <img
      className="favicon"
      src={src}
      alt=""
      width={34}
      height={34}
      onError={() => setFailed(true)}
    />
  );
}

export interface PageCardProps {
  readonly view: ViewState;
  readonly phase: AnalysisPhase;
}

/** Card that presents the current page, detection loading, or an error. */
export function PageCard({ view, phase }: PageCardProps) {
  const status = view.kind === 'detected' ? getCardStatus(view, phase) : null;

  return (
    <div className="card">
      {view.kind === 'detecting' && (
        <div className="card__detecting">
          <Spinner />
          <span>Detecting current page…</span>
        </div>
      )}

      {view.kind === 'detected' && (
        <div className="card__row">
          <Favicon src={view.page.faviconUrl} />
          <div className="card__body">
            <p className="card__hostname" title={view.page.title ?? view.page.hostname}>
              {getDisplayHostname(view.page.hostname)}
            </p>
            {status !== null && <StatusIndicator tone={status.tone} label={status.label} />}
          </div>
        </div>
      )}

      {(view.kind === 'unsupported' || view.kind === 'error') && (
        <div className="issue">
          <span
            className={cx(
              'issue__icon',
              getIssueTone(view.issue) === 'danger' && 'issue__icon--danger',
            )}
          >
            <IconAlert width={18} height={18} />
          </span>
          <div className="issue__body">
            <p className="issue__title">{getIssueTitle(view.issue)}</p>
            <p className="issue__hint">{getIssueHint(view.issue)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
