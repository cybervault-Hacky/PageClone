import type { CaptureResult } from '@/shared/types';

export interface AnalysisSummaryProps {
  readonly result: CaptureResult;
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{formatCount(value)}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

/**
 * Success summary for a completed capture: plain-language statistics, plus
 * an honest note when the capture was partial. Never claims a clone exists.
 */
export function AnalysisSummary({ result }: AnalysisSummaryProps) {
  const stats = result.statistics;
  const partial = stats.truncated;

  return (
    <section className="summary" aria-label="Analysis results">
      <div className="stats-grid">
        <StatTile value={stats.elementsCaptured} label="Elements" />
        <StatTile value={stats.images} label="Images" />
        <StatTile value={stats.svgs} label="SVGs" />
        <StatTile value={stats.links} label="Links" />
        <StatTile value={stats.styledElements} label="Styled" />
        <StatTile value={stats.assetsDiscovered} label="Assets" />
      </div>
      {partial && (
        <p className="summary__partial">
          Analyzed with limitations — some content was skipped on this large page.
        </p>
      )}
    </section>
  );
}
