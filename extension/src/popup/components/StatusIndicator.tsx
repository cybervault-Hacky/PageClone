import type { StatusTone } from '../types';
import { cx } from '../utils/cx';

export interface StatusIndicatorProps {
  readonly tone: StatusTone;
  readonly label: string;
}

/** Small dot + label used to communicate page/analysis state. */
export function StatusIndicator({ tone, label }: StatusIndicatorProps) {
  return (
    <p className={cx('status', `status--${tone}`)}>
      <span className="status__dot" aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}
