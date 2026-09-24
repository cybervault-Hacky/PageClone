/**
 * Popup-side reconstruction client.
 *
 * Bridges the popup to the pure reconstruction engine: builds the preview
 * document from the validated CaptureResult and re-validates the output
 * before anything may be rendered. Failures become canonical, honest copy —
 * never a broken document or an internal error.
 */
import {
  ReconstructionInputError,
  reconstructCapture,
  validateReconstructionResult,
} from '@/shared/reconstruct';
import type { ReconstructionStatistics } from '@/shared/types';
import type { CaptureResult } from '@/shared/types';

export type ReconstructionPreview =
  | {
      readonly ok: true;
      readonly html: string;
      readonly css: string;
      readonly statistics: ReconstructionStatistics;
      readonly warningCount: number;
    }
  | { readonly ok: false; readonly message: string };

/** Honest copy when reconstruction cannot produce a valid document. */
export const RECONSTRUCTION_FAILED_MESSAGE =
  'Reconstruction could not produce a safe preview for this page.';

export function buildReconstructionPreview(capture: CaptureResult): ReconstructionPreview {
  try {
    const result = reconstructCapture(capture);
    const validated = validateReconstructionResult(result);
    if (!validated.ok) return { ok: false, message: RECONSTRUCTION_FAILED_MESSAGE };
    return {
      ok: true,
      html: result.html,
      css: result.css,
      statistics: result.statistics,
      warningCount: result.warnings.reduce((total, warning) => total + warning.count, 0),
    };
  } catch (error) {
    if (error instanceof ReconstructionInputError) {
      return { ok: false, message: RECONSTRUCTION_FAILED_MESSAGE };
    }
    return { ok: false, message: RECONSTRUCTION_FAILED_MESSAGE };
  }
}
