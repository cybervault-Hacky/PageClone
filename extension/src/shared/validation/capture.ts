/**
 * Background-side validation of CaptureResult before it may reach the popup.
 *
 * The content script runs in the page's origin — its response is treated as
 * untrusted input. Anything malformed is rejected with a structured error
 * code; internal details are never exposed.
 */
import { CAPTURE_LIMITS, CAPTURE_RESULT_VERSION } from '../constants/capture';
import type { CaptureErrorCode, CaptureResult } from '../types/capture';

export type CaptureValidationOutcome =
  | { readonly ok: true; readonly result: CaptureResult }
  | {
      readonly ok: false;
      readonly code: Extract<
        CaptureErrorCode,
        'CAPTURE_INVALID_RESULT' | 'CAPTURE_SERIALIZATION_FAILED' | 'CAPTURE_LIMIT_REACHED'
      >;
    };

interface ValidationLimits {
  readonly maxElements: number;
  readonly maxAssets: number;
  readonly maxTotalText: number;
  readonly maxTextLength: number;
  readonly maxSerializedBytes: number;
}

const DEFAULT_LIMITS: ValidationLimits = CAPTURE_LIMITS;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fail(): CaptureValidationOutcome {
  return { ok: false, code: 'CAPTURE_INVALID_RESULT' };
}

function validateNode(
  node: unknown,
  index: number,
  ids: Set<number>,
  limits: ValidationLimits,
): boolean {
  if (!isPlainObject(node)) return false;
  if (!isFiniteNumber(node.nodeId) || node.nodeId < 0 || !Number.isInteger(node.nodeId)) {
    return false;
  }
  if (ids.has(node.nodeId)) return false;
  ids.add(node.nodeId);

  const parentId = node.parentId;
  if (parentId !== null && (!isFiniteNumber(parentId) || !Number.isInteger(parentId))) {
    return false;
  }

  if (!Array.isArray(node.childNodeIds)) return false;
  for (const childId of node.childNodeIds) {
    if (!isFiniteNumber(childId) || !Number.isInteger(childId)) return false;
  }

  if (typeof node.tagName !== 'string' || node.tagName === '') return false;
  if (!isPlainObject(node.attributes)) return false;
  for (const [key, value] of Object.entries(node.attributes)) {
    if (key === '' || typeof value !== 'string') return false;
  }

  if (node.text !== undefined && typeof node.text !== 'string') return false;
  if (typeof node.text === 'string' && node.text.length > limits.maxTextLength) return false;

  if (node.styles !== undefined) {
    if (!isPlainObject(node.styles)) return false;
    for (const value of Object.values(node.styles)) {
      if (typeof value !== 'string') return false;
    }
  }

  if (node.layout !== undefined) {
    if (!isPlainObject(node.layout)) return false;
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      if (!isFiniteNumber(node.layout[key])) return false;
    }
  }

  if (!isPlainObject(node.semantic)) return false;
  if (typeof node.semantic.interactive !== 'boolean') return false;
  const level = node.semantic.headingLevel;
  if (level !== null && (!isFiniteNumber(level) || level < 1 || level > 6)) return false;

  void index;
  void ids;
  return true;
}

/**
 * Validates an untrusted value as a CaptureResult.
 * Rejects malformed schemas, out-of-bound sizes, broken tree references and
 * non-serializable payloads.
 */
export function validateCaptureResult(
  value: unknown,
  limits: ValidationLimits = DEFAULT_LIMITS,
): CaptureValidationOutcome {
  if (!isPlainObject(value)) return fail();
  if (value.version !== CAPTURE_RESULT_VERSION) return fail();
  if (!isFiniteNumber(value.capturedAt)) return fail();

  // page
  const page = value.page;
  if (!isPlainObject(page)) return fail();
  if (typeof page.url !== 'string' || page.url === '') return fail();
  if (typeof page.hostname !== 'string' || page.hostname === '') return fail();
  if (page.title !== null && typeof page.title !== 'string') return fail();
  if (typeof page.language !== 'string') return fail();
  if (page.direction !== 'ltr' && page.direction !== 'rtl') return fail();
  if (page.faviconUrl !== null && typeof page.faviconUrl !== 'string') return fail();

  // viewport
  const viewport = value.viewport;
  if (!isPlainObject(viewport)) return fail();
  for (const key of [
    'width',
    'height',
    'devicePixelRatio',
    'scrollWidth',
    'scrollHeight',
  ] as const) {
    if (!isFiniteNumber(viewport[key]) || viewport[key] < 0) return fail();
  }

  // nodes
  const nodes = value.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return fail();
  return validateNodes(nodes, value, limits);
}

function validateNodes(
  nodes: unknown[],
  value: Record<string, unknown>,
  limits: ValidationLimits,
): CaptureValidationOutcome {
  if (nodes.length > limits.maxElements) return { ok: false, code: 'CAPTURE_LIMIT_REACHED' };

  const ids = new Set<number>();
  let roots = 0;
  let totalText = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    if (!validateNode(nodes[i], i, ids, limits)) return fail();
    const node = nodes[i] as Record<string, unknown>;
    if (node.parentId === null) roots += 1;
    if (typeof node.text === 'string') totalText += node.text.length;
  }
  if (roots !== 1) return fail();
  if (totalText > limits.maxTotalText) return { ok: false, code: 'CAPTURE_LIMIT_REACHED' };

  // referential integrity: children point at existing parents and back
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i] as Record<string, unknown>;
    for (const childId of node.childNodeIds as number[]) {
      if (!ids.has(childId)) return fail();
    }
    if (node.parentId !== null && !ids.has(node.parentId as number)) return fail();
  }

  // assets
  const assets = value.assets;
  if (!Array.isArray(assets)) return fail();
  if (assets.length > limits.maxAssets) return { ok: false, code: 'CAPTURE_LIMIT_REACHED' };
  for (const asset of assets) {
    if (!isPlainObject(asset)) return fail();
    if (!isFiniteNumber(asset.assetId) || asset.assetId < 0) return fail();
    if (typeof asset.kind !== 'string' || typeof asset.source !== 'string') return fail();
    if (
      asset.nodeId !== null &&
      (!isFiniteNumber(asset.nodeId) || !Number.isInteger(asset.nodeId))
    ) {
      return fail();
    }
    for (const key of ['width', 'height'] as const) {
      if (asset[key] !== null && !isFiniteNumber(asset[key])) return fail();
    }
    if (asset.alt !== null && typeof asset.alt !== 'string') return fail();
  }

  // links
  const links = value.links;
  if (!Array.isArray(links)) return fail();
  for (const link of links) {
    if (!isPlainObject(link)) return fail();
    if (!isFiniteNumber(link.nodeId) || !Number.isInteger(link.nodeId)) return fail();
    if (typeof link.href !== 'string') return fail();
    if (link.target !== null && typeof link.target !== 'string') return fail();
    if (link.rel !== null && typeof link.rel !== 'string') return fail();
    if (typeof link.text !== 'string') return fail();
  }

  // statistics
  const stats = value.statistics;
  if (!isPlainObject(stats)) return fail();
  const numericStats = [
    'elementsCaptured',
    'elementsSkipped',
    'images',
    'svgs',
    'styledElements',
    'links',
    'assetsDiscovered',
    'textCharactersCaptured',
    'durationMs',
    'serializedBytes',
  ] as const;
  for (const key of numericStats) {
    if (!isFiniteNumber(stats[key]) || stats[key] < 0) return fail();
  }
  if (typeof stats.truncated !== 'boolean') return fail();
  const elementsCaptured = stats.elementsCaptured;
  const textCharactersCaptured = stats.textCharactersCaptured;
  if (typeof elementsCaptured !== 'number' || typeof textCharactersCaptured !== 'number') {
    return fail();
  }
  if (elementsCaptured > limits.maxElements) {
    return { ok: false, code: 'CAPTURE_LIMIT_REACHED' };
  }
  if (textCharactersCaptured > limits.maxTotalText) {
    return { ok: false, code: 'CAPTURE_LIMIT_REACHED' };
  }

  // warnings
  const warnings = value.warnings;
  if (!Array.isArray(warnings)) return fail();
  for (const warning of warnings) {
    if (!isPlainObject(warning)) return fail();
    if (typeof warning.code !== 'string' || typeof warning.message !== 'string') return fail();
  }

  // security summary
  const security = value.security;
  if (!isPlainObject(security)) return fail();
  for (const key of [
    'formValuesOmitted',
    'passwordFieldsOmitted',
    'eventHandlerAttributesDropped',
    'unsafeUrlsSanitized',
    'svgScriptsRemoved',
  ] as const) {
    if (!isFiniteNumber(security[key]) || security[key] < 0) return fail();
  }
  if (security.cookiesAccessed !== false || security.storageAccessed !== false) return fail();

  // serialization safety + hard size cap
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, code: 'CAPTURE_SERIALIZATION_FAILED' };
  }
  if (serialized === undefined) return { ok: false, code: 'CAPTURE_SERIALIZATION_FAILED' };
  if (serialized.length > limits.maxSerializedBytes) {
    return { ok: false, code: 'CAPTURE_LIMIT_REACHED' };
  }

  return { ok: true, result: value as unknown as CaptureResult };
}
