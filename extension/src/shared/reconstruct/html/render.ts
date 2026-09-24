/**
 * HTML tree renderer: converts the normalized captured node tree into the
 * body content of the reconstructed document.
 *
 * Rules:
 * - the tree is rebuilt from `CapturedNode` data — captured source HTML is
 *   never copied;
 * - unsupported elements are unwrapped (children kept), dangerous elements
 *   are dropped, and every deviation is counted as a warning;
 * - text is always escaped; form-field text is never emitted;
 * - block-level siblings are separated by deterministic newlines, whitespace
 *   around inline content is never introduced (rendering must not change).
 */
import { isBlockishNode } from '@/shared/constants/reconstruct';
import type { ReconstructionOptions } from '@/shared/types/reconstruct';
import type { AssetReference, CapturedNode, CaptureResult } from '@/shared/types/capture';
import { escapeHtml } from './escape';
import { renderAttributes } from './attributes';
import { classifyTag, isVoidElement, isShellTag, preservesWhitespace } from './tags';
import { reconstructSvgMarkup } from './svg';
import type { ReconstructionState } from '../state';
import { TEXT_SUPPRESSED_TAGS } from '@/shared/constants/reconstruct';

export interface HtmlRenderContext {
  readonly capture: CaptureResult;
  readonly state: ReconstructionState;
  readonly options: ReconstructionOptions;
  readonly pageUrl: string;
  readonly nodesById: Map<number, CapturedNode>;
  readonly svgMarkupByNode: Map<number, AssetReference>;
}

export interface BodyContentResult {
  readonly bodyHtml: string;
  /** Class for the <body> shell, from the CSS pass. */
  readonly bodyClass: string | null;
  /** Class for the <html> shell, from the CSS pass. */
  readonly htmlClass: string | null;
  /** The captured body node when present (null → root children are content). */
  readonly bodyNode: CapturedNode | null;
  readonly htmlNode: CapturedNode | null;
}

const INDENT_UNIT = '  ';

function indent(depth: number): string {
  return INDENT_UNIT.repeat(depth);
}

function childNodes(node: CapturedNode, context: HtmlRenderContext): CapturedNode[] {
  const children: CapturedNode[] = [];
  for (const childId of node.childNodeIds) {
    const child = context.nodesById.get(childId);
    if (child !== undefined) children.push(child);
  }
  return children;
}

function countSkippedSubtree(node: CapturedNode, context: HtmlRenderContext): number {
  let skipped = 1;
  for (const child of childNodes(node, context)) skipped += countSkippedSubtree(child, context);
  return skipped;
}

function renderSvgNode(node: CapturedNode, context: HtmlRenderContext): string {
  const { state } = context;
  const asset = context.svgMarkupByNode.get(node.nodeId);
  const reconstruction = asset !== undefined ? reconstructSvgMarkup(asset.source) : null;

  if (reconstruction === null || reconstruction.markup === null) {
    state.warn('SVG_MARKUP_UNAVAILABLE');
    state.counters.nodesSkipped += 1;
    return '';
  }
  if (reconstruction.resanitized) {
    // The reconstruction layer had to sanitize this markup again.
    state.warn('SVG_MARKUP_UNAVAILABLE');
  }

  state.counters.nodesReconstructed += 1;
  state.counters.svgInlineReconstructed += 1;
  return reconstruction.markup;
}

function renderChildren(
  node: CapturedNode,
  depth: number,
  context: HtmlRenderContext,
): { html: string; hasBlockishChild: boolean } {
  const children = childNodes(node, context);
  if (children.length === 0) return { html: '', hasBlockishChild: false };

  const preserve = preservesWhitespace(node.tagName);
  const parts: string[] = [];
  let hasBlockishChild = false;

  for (const child of children) {
    const childBlockish = isBlockishNode(child.tagName, child.styles?.display);
    if (!preserve && childBlockish) {
      parts.push(`\n${indent(depth + 1)}`);
      hasBlockishChild = true;
    }
    parts.push(renderNode(child, depth + 1, context));
  }

  if (hasBlockishChild && !preserve) parts.push(`\n${indent(depth)}`);
  return { html: parts.join(''), hasBlockishChild };
}

function renderElement(node: CapturedNode, depth: number, context: HtmlRenderContext): string {
  const { state, options } = context;
  const tag = node.tagName;
  state.counters.nodesReconstructed += 1;

  const generatedClass = state.classFor(node.nodeId);
  const attributes = renderAttributes(node, generatedClass, context.pageUrl, options, state);

  let textHtml = '';
  if (node.text !== undefined) {
    if (TEXT_SUPPRESSED_TAGS.has(tag)) {
      // Text inside form fields is a VALUE — never reconstructed.
      state.warn('FORM_VALUE_OMITTED');
    } else {
      textHtml = escapeHtml(node.text);
      state.counters.textNodesReconstructed += 1;
    }
  }

  const { html: childrenHtml } = renderChildren(node, depth, context);

  if (isVoidElement(tag)) {
    return `<${tag}${attributes.html}>${childrenHtml}`;
  }

  return `<${tag}${attributes.html}>${textHtml}${childrenHtml}</${tag}>`;
}

function renderNode(node: CapturedNode, depth: number, context: HtmlRenderContext): string {
  const { state } = context;

  if (node.svg === true) return renderSvgNode(node, context);

  const disposition = classifyTag(node.tagName);

  if (disposition === 'dangerous') {
    state.warn('UNSAFE_ELEMENT_REMOVED');
    state.counters.nodesSkipped += countSkippedSubtree(node, context);
    return '';
  }

  if (disposition === 'unsupported' || isShellTag(node.tagName)) {
    // Unsupported/shell element: keep safe children, drop the wrapper.
    state.warn('UNSUPPORTED_ELEMENT');
    state.counters.nodesSkipped += 1;
    state.counters.elementsUnwrapped += 1;
    const { html } = renderChildren(node, depth, context);
    return html;
  }

  return renderElement(node, depth, context);
}

function accountHeadSubtree(head: CapturedNode, context: HtmlRenderContext): void {
  const { state } = context;
  state.counters.nodesReconstructed += 1; // the head shell itself

  for (const child of childNodes(head, context)) {
    if (child.tagName === 'title') {
      // Rebuilt from page metadata (same captured string).
      state.counters.nodesReconstructed += 1;
      if (child.text !== undefined) state.counters.textNodesReconstructed += 1;
      continue;
    }
    state.warn('HEAD_METADATA_SIMPLIFIED');
    state.counters.nodesSkipped += countSkippedSubtree(child, context);
  }
}

/**
 * Renders the full body content and reports the shell classes needed by the
 * document assembler.
 */
export function renderBodyContent(context: HtmlRenderContext): BodyContentResult {
  const { capture, state } = context;
  const root = capture.nodes[0];
  if (root === undefined)
    return { bodyHtml: '', bodyClass: null, htmlClass: null, bodyNode: null, htmlNode: null };

  if (root.tagName !== 'html') {
    // Degenerate capture: reconstruct the root as an ordinary body child.
    return {
      bodyHtml: renderNode(root, 0, context),
      bodyClass: null,
      htmlClass: null,
      bodyNode: null,
      htmlNode: null,
    };
  }

  state.counters.nodesReconstructed += 1; // the html shell
  const htmlClass = state.classFor(root.nodeId);
  if (htmlClass !== null) state.counters.attributesReconstructed += 1;

  const rootChildren = childNodes(root, context);
  const headNode = rootChildren.find((node) => node.tagName === 'head') ?? null;
  const bodyNode = rootChildren.find((node) => node.tagName === 'body') ?? null;

  if (headNode !== null) accountHeadSubtree(headNode, context);

  const contentNodes =
    bodyNode !== null
      ? childNodes(bodyNode, context)
      : rootChildren.filter((node) => node !== headNode);

  if (bodyNode !== null) state.counters.nodesReconstructed += 1; // body shell

  const parts: string[] = [];
  let hasBlockishChild = false;
  for (const child of contentNodes) {
    const childBlockish = isBlockishNode(child.tagName, child.styles?.display);
    if (childBlockish) {
      parts.push(`\n${indent(1)}`);
      hasBlockishChild = true;
    }
    parts.push(renderNode(child, 1, context));
  }
  if (hasBlockishChild) parts.push('\n');

  return {
    bodyHtml: parts.join(''),
    bodyClass: bodyNode !== null ? state.classFor(bodyNode.nodeId) : null,
    htmlClass,
    bodyNode,
    htmlNode: root,
  };
}
