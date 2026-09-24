/**
 * Deterministic reconstruction state: counters, deduplicated warnings and
 * the node → generated-class registry that keeps the emitted HTML and CSS
 * perfectly synchronized (a class exists iff a rule references it).
 */
import { generatedClassName } from '@/shared/constants/reconstruct';
import type {
  ReconstructionOptions,
  ReconstructionStatistics,
  ReconstructionWarning,
  ReconstructionWarningCode,
} from '@/shared/types/reconstruct';

export interface ReconstructionCounters {
  nodesReconstructed: number;
  nodesSkipped: number;
  elementsUnwrapped: number;
  textNodesReconstructed: number;
  attributesReconstructed: number;
  stylesReconstructed: number;
  styleRules: number;
  pseudoElementsReconstructed: number;
  svgInlineReconstructed: number;
  externalAssetReferences: number;
}

export interface ReconstructionState {
  readonly options: ReconstructionOptions;
  readonly counters: ReconstructionCounters;
  /** nodeId → generated class; entries exist iff the CSS references them. */
  readonly generatedClassByNode: Map<number, string>;
  /** Warning code → occurrence count (insertion order = deterministic). */
  readonly warnings: Map<ReconstructionWarningCode, number>;
  registerClass: (nodeId: number) => void;
  classFor: (nodeId: number) => string | null;
  warn: (code: ReconstructionWarningCode, count?: number) => void;
}

export function createReconstructionState(options: ReconstructionOptions): ReconstructionState {
  const generatedClassByNode = new Map<number, string>();
  const warnings = new Map<ReconstructionWarningCode, number>();

  return {
    options,
    generatedClassByNode,
    warnings,
    counters: {
      nodesReconstructed: 0,
      nodesSkipped: 0,
      elementsUnwrapped: 0,
      textNodesReconstructed: 0,
      attributesReconstructed: 0,
      stylesReconstructed: 0,
      styleRules: 0,
      pseudoElementsReconstructed: 0,
      svgInlineReconstructed: 0,
      externalAssetReferences: 0,
    },
    registerClass(nodeId: number): void {
      if (!generatedClassByNode.has(nodeId)) {
        generatedClassByNode.set(nodeId, generatedClassName(nodeId));
      }
    },
    classFor(nodeId: number): string | null {
      return generatedClassByNode.get(nodeId) ?? null;
    },
    warn(code: ReconstructionWarningCode, count = 1): void {
      warnings.set(code, (warnings.get(code) ?? 0) + count);
    },
  };
}

/** Freezes the accumulated state into the result's statistics + warnings. */
export function toStatisticsAndWarnings(state: ReconstructionState): {
  statistics: ReconstructionStatistics;
  warnings: ReconstructionWarning[];
} {
  const counters = state.counters;
  const warningMessages: Readonly<Record<ReconstructionWarningCode, string>> = {
    UNSUPPORTED_ELEMENT: 'Unsupported elements were replaced by their safe children.',
    UNSAFE_ELEMENT_REMOVED: 'Executable or unsafe elements were removed.',
    UNSAFE_ATTRIBUTE_OMITTED: 'Attributes outside the reconstruction policy were omitted.',
    UNSAFE_URL_OMITTED: 'Attributes with unsafe URLs were omitted.',
    STYLE_PROPERTY_OMITTED: 'Style values that could not be emitted safely were omitted.',
    PSEUDO_ELEMENT_UNAVAILABLE: 'Some pseudo-element details were not capturable.',
    EXTERNAL_ASSET_REFERENCE: 'External asset references remain links to their origin.',
    FORM_VALUE_OMITTED: 'Form field content is never reconstructed.',
    SVG_MARKUP_UNAVAILABLE:
      'Some inline SVG markup was re-sanitized or could not be reconstructed.',
    HEAD_METADATA_SIMPLIFIED: 'Head metadata was rebuilt minimally from page information.',
  };

  const warnings: ReconstructionWarning[] = Array.from(state.warnings.entries()).map(
    ([code, count]) => ({ code, message: warningMessages[code], count }),
  );

  const statistics: ReconstructionStatistics = {
    nodesReconstructed: counters.nodesReconstructed,
    nodesSkipped: counters.nodesSkipped,
    elementsUnwrapped: counters.elementsUnwrapped,
    textNodesReconstructed: counters.textNodesReconstructed,
    attributesReconstructed: counters.attributesReconstructed,
    stylesReconstructed: counters.stylesReconstructed,
    styleRules: counters.styleRules,
    pseudoElementsReconstructed: counters.pseudoElementsReconstructed,
    svgInlineReconstructed: counters.svgInlineReconstructed,
    warnings: warnings.length,
    htmlBytes: 0, // filled by the orchestrator once HTML exists
    cssBytes: 0, // filled by the orchestrator once CSS exists
  };

  return { statistics, warnings };
}
