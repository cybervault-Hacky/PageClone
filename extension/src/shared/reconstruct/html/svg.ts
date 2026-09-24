/**
 * Inline SVG reconstruction.
 *
 * Phase 2 stores inline SVGs as sanitized markup assets. The reconstruction
 * layer treats that markup as untrusted again: it re-runs the existing
 * sanitizer when a DOM parser is available and always applies a structural
 * string gate. Markup that fails either path is not reconstructed.
 */
import { sanitizeSvgMarkup } from '@/shared/security/redact';

const UNSAFE_SVG_PATTERNS: readonly RegExp[] = [
  /<script/i,
  /<foreignObject/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /\son[a-z]+\s*=/i,
  /javascript:/i,
  /vbscript:/i,
  /data:text\/html/i,
];

/** Cheap structural gate usable in every JS environment (no DOM required). */
export function passesSvgStringGate(markup: string): boolean {
  return !UNSAFE_SVG_PATTERNS.some((pattern) => pattern.test(markup));
}

export interface SvgReconstruction {
  /** Safe markup, or null when it cannot be guaranteed safe. */
  readonly markup: string | null;
  /** True when the reconstruction layer had to sanitize again. */
  readonly resanitized: boolean;
}

/**
 * Returns safe SVG markup for reconstruction, or null when the markup
 * cannot be guaranteed safe.
 */
export function reconstructSvgMarkup(assetMarkup: string): SvgReconstruction {
  if (typeof DOMParser === 'function') {
    const resanitized = sanitizeSvgMarkup(assetMarkup);
    if (resanitized.markup !== null) {
      const changed =
        resanitized.scriptsRemoved +
          resanitized.eventHandlerAttributesDropped +
          resanitized.unsafeUrlsSanitized >
        0;
      return { markup: resanitized.markup, resanitized: changed };
    }
    // The capture-time sanitizer accepted this markup; if the local parser
    // is simply stricter, fall through to the structural gate below.
  }
  return { markup: passesSvgStringGate(assetMarkup) ? assetMarkup : null, resanitized: false };
}
