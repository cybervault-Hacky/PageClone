import type { PageIssue, PageMetadata } from '@/shared/types';

/**
 * UI-level interpretation of what detection produced.
 * Kept separate from `PageDetection` so presentation can evolve freely.
 */
export type ViewState =
  | { readonly kind: 'detecting' }
  | { readonly kind: 'detected'; readonly page: PageMetadata }
  | { readonly kind: 'unsupported'; readonly issue: PageIssue }
  | { readonly kind: 'error'; readonly issue: PageIssue };

/** Visual tone for status dots and icons. */
export type StatusTone = 'ok' | 'busy' | 'muted' | 'danger';
