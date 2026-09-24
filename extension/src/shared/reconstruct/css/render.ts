/**
 * CSS renderer: generates the reconstruction stylesheet from the captured
 * computed styles. Nothing is copied from the original site's CSS — every
 * declaration is re-serialized, sanitized captured data, which keeps the
 * output deterministic, bounded and independent of the source stylesheets.
 */
import { isViewportDimensionProperty, SHELL_TAGS } from '@/shared/constants/reconstruct';
import { STYLE_PROPERTY_WHITELIST } from '@/shared/constants/capture';
import type { CapturedNode, CaptureResult, PseudoElementStyle } from '@/shared/types/capture';
import { compareProperties, isNoOpValue } from './properties';
import { firstCssUrl, sanitizeCssValue } from './values';
import { renderPseudoRule } from './pseudo';
import type { ReconstructionState } from '../state';

const STYLESHEET_HEADER =
  '/* PageClone reconstruction — deterministic generated styles. */\n' +
  '/* Generated pc-n classes map 1:1 to captured nodes; do not hand-edit. */';

interface StyleEntry {
  readonly property: string;
  readonly value: string;
}

function serializeRule(selector: string, declarations: readonly string[]): string {
  const body = declarations.map((declaration) => `  ${declaration}`).join('\n');
  return `${selector} {\n${body}\n}`;
}

function countExternalUrls(declarations: readonly string[], state: ReconstructionState): void {
  for (const declaration of declarations) {
    if (/url\("https?:\/\//i.test(declaration)) state.counters.externalAssetReferences += 1;
  }
}

/**
 * Sanitized declarations for one node, in canonical whitelist order.
 * Returns an empty list when nothing usable was captured.
 */
function elementDeclarations(
  node: CapturedNode,
  pageUrl: string,
  state: ReconstructionState,
): string[] {
  const styles = node.styles;
  if (styles === undefined) return [];

  const isShell = SHELL_TAGS.has(node.tagName);
  const entries: StyleEntry[] = [];

  for (const property of STYLE_PROPERTY_WHITELIST) {
    const raw = styles[property];
    if (raw === undefined || raw === '') continue;
    if (isNoOpValue(property, raw)) continue;
    // Viewport-derived dimensions of html/body are never pinned; the
    // reconstructed document must size itself like the original page did.
    if (isShell && isViewportDimensionProperty(property)) continue;
    entries.push({ property, value: raw });
  }

  // transform-origin only matters alongside a surviving transform.
  const hasTransform = entries.some((entry) => entry.property === 'transform');
  if (!hasTransform) {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if (entries[i]?.property === 'transform-origin') entries.splice(i, 1);
    }
  }

  entries.sort((a, b) => compareProperties(a.property, b.property));

  const declarations: string[] = [];
  for (const entry of entries) {
    const sanitized = sanitizeCssValue(entry.property, entry.value, pageUrl);
    if (!sanitized.ok) {
      state.warn('STYLE_PROPERTY_OMITTED');
      continue;
    }
    declarations.push(`${entry.property}: ${sanitized.value};`);
  }
  return declarations;
}

/**
 * Collects the node ids of the captured head subtree — they never render as
 * elements, so they must never receive generated rules or classes.
 */
function headSubtreeIds(capture: CaptureResult): ReadonlySet<number> {
  const nodesById = new Map(capture.nodes.map((node) => [node.nodeId, node]));
  const root = capture.nodes[0];
  const ids = new Set<number>();
  if (root === undefined || root.tagName !== 'html') return ids;

  const head = root.childNodeIds
    .map((id) => nodesById.get(id))
    .find((node) => node?.tagName === 'head');
  if (head === undefined) return ids;

  const visit = (node: CapturedNode): void => {
    ids.add(node.nodeId);
    for (const childId of node.childNodeIds) {
      const child = nodesById.get(childId);
      if (child !== undefined) visit(child);
    }
  };
  visit(head);
  return ids;
}

/**
 * Renders the whole stylesheet and registers generated classes for exactly
 * the nodes whose rules were emitted (HTML ⇄ CSS synchronization invariant).
 */
export function renderStyleSheet(capture: CaptureResult, state: ReconstructionState): string {
  const pageUrl = capture.page.url;
  const ruleBlocks: string[] = [];
  const skippedHeadNodes = headSubtreeIds(capture);

  for (const node of capture.nodes) {
    // Head-subtree and inline-SVG nodes get no generated rule: head styling
    // is not reconstructed, and SVG markup carries its own presentation.
    if (skippedHeadNodes.has(node.nodeId) || node.svg === true) continue;

    const declarations = elementDeclarations(node, pageUrl, state);
    countExternalUrls(declarations, state);

    const pseudoBlocks: string[] = [];
    if (state.options.includePseudoElements && node.pseudo !== undefined) {
      const sides: readonly (readonly [string, PseudoElementStyle | undefined])[] = [
        ['::before', node.pseudo.before],
        ['::after', node.pseudo.after],
      ];
      for (const [suffix, pseudo] of sides) {
        if (pseudo === undefined) continue;
        const onWarning = (count: number): void => state.warn('PSEUDO_ELEMENT_UNAVAILABLE', count);
        const rule = renderPseudoRule(`.pc-n${node.nodeId}${suffix}`, pseudo, pageUrl, onWarning);
        if (rule !== null) {
          pseudoBlocks.push(serializeRule(rule.selector, rule.declarations));
          state.counters.pseudoElementsReconstructed += 1;
          const firstUrl = firstCssUrl(pseudo.backgroundImage ?? '');
          if (firstUrl !== null && /^https?:/i.test(firstUrl)) {
            state.counters.externalAssetReferences += 1;
          }
        }
      }
    }

    if (declarations.length === 0 && pseudoBlocks.length === 0) continue;

    // A class is generated iff at least one rule references it.
    state.registerClass(node.nodeId);
    const selector = `.pc-n${node.nodeId}`;

    if (declarations.length > 0) {
      ruleBlocks.push(serializeRule(selector, declarations));
      state.counters.styleRules += 1;
      state.counters.stylesReconstructed += declarations.length;
    }
    ruleBlocks.push(...pseudoBlocks);
  }

  if (ruleBlocks.length === 0) return '';
  return `${STYLESHEET_HEADER}\n\n${ruleBlocks.join('\n\n')}\n`;
}
