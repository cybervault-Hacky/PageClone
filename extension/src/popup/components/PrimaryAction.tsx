import type { AnalysisPhase } from '@/shared/types';
import type { ViewState } from '../types';
import { Spinner } from './Spinner';

export interface PrimaryActionProps {
  readonly view: ViewState;
  readonly phase: AnalysisPhase;
  readonly onAnalyze: () => void;
}

/** The single primary CTA. Disabled until a supported page is detected. */
export function PrimaryAction({ view, phase, onAnalyze }: PrimaryActionProps) {
  const detecting = view.kind === 'detecting';
  const supported = view.kind === 'detected';
  const analyzing = supported && phase === 'analyzing';
  const canRetry = supported && (phase === 'ready' || phase === 'error');
  const disabled = detecting || !supported || analyzing;

  let label = 'Analyze Page';
  if (detecting) label = 'Detecting page…';
  else if (analyzing) label = 'Analyzing…';
  else if (supported && phase === 'ready') label = 'Analyze again';
  else if (canRetry && phase === 'error') label = 'Try again';

  return (
    <button
      type="button"
      className="button button--primary"
      onClick={onAnalyze}
      disabled={disabled}
      aria-busy={analyzing}
    >
      {(detecting || analyzing) && <Spinner />}
      <span>{label}</span>
    </button>
  );
}
