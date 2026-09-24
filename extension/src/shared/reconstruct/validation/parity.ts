/**
 * Structure parity: compares a CaptureResult with its reconstructed HTML.
 *
 * Phase 3 is about structural reconstruction — this report proves tag
 * hierarchy, text presence, headings, links, interactive elements and images
 * survive reconstruction (pixel-perfect visual comparison is a later phase).
 *
 * The expected side mirrors the renderer's documented deviations: unsupported
 * elements are unwrapped, dangerous subtrees are dropped, inline SVGs count
 * as single leaf elements, and head metadata is rebuilt rather than copied.
 */
import { ALLOWED_TAGS } from '@/shared/constants/reconstruct';
import type { CapturedNode, CaptureResult } from '@/shared/types/capture';

export interface StructureParityReport {
  /** Captured elements expected in the reconstructed body. */
  readonly capturedElements: number;
  /** Elements found in the reconstructed document's body. */
  readonly reconstructedElements: number;
  /** reconstructedElements / capturedElements (null when nothing expected). */
  readonly elementRatio: number | null;
  readonly tagSequenceMatches: boolean;
  readonly textMatches: boolean;
  readonly headingsMatch: boolean;
  readonly linksMatch: boolean;
  readonly interactiveMatch: boolean;
  readonly imagesMatch: boolean;
  readonly withinTolerance: boolean;
}

interface ParityWalk {
  tags: string[];
  text: string[];
  headings: string[];
  links: string[];
  interactive: number;
  images: number;
  elements: number;
}

const HEADING_TAGS: ReadonlySet<string> = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const INTERACTIVE_TAGS: ReadonlySet<string> = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
]);
const IMAGE_TAGS: ReadonlySet<string> = new Set(['img', 'source']);
/** Rebuilt from metadata by the assembler — not part of body parity. */
const HEAD_ONLY_TAGS: ReadonlySet<string> = new Set(['title', 'meta', 'link', 'base']);
/** Elements whose text content is not compared (empty or value-like). */
const TEXTLESS_TAGS: ReadonlySet<string> = new Set([
  'svg',
  'img',
  'input',
  'textarea',
  'source',
  'track',
  'br',
  'hr',
  'col',
]);

function createWalk(): ParityWalk {
  return { tags: [], text: [], headings: [], links: [], interactive: 0, images: 0, elements: 0 };
}

function pushElement(walk: ParityWalk, tagName: string): void {
  walk.tags.push(tagName);
  walk.elements += 1;
  if (HEADING_TAGS.has(tagName)) walk.headings.push(tagName);
  if (INTERACTIVE_TAGS.has(tagName)) walk.interactive += 1;
  if (IMAGE_TAGS.has(tagName)) walk.images += 1;
}

function stripWhitespace(value: string): string {
  return value.replace(/\s+/g, '');
}

/** Expected-side walk over the captured body subtree. */
function walkCapturedTree(
  node: CapturedNode,
  walk: ParityWalk,
  nodesById: Map<number, CapturedNode>,
  svgReconstructable: ReadonlySet<number>,
): void {
  if (node.svg === true) {
    // Mirrors the renderer: only svg nodes with a usable asset are emitted.
    if (svgReconstructable.has(node.nodeId)) pushElement(walk, 'svg');
    return;
  }
  if (HEAD_ONLY_TAGS.has(node.tagName)) return;
  if (!ALLOWED_TAGS.has(node.tagName)) {
    // Unsupported wrapper: children are kept, the tag itself is not.
    for (const childId of node.childNodeIds) {
      const child = nodesById.get(childId);
      if (child !== undefined) walkCapturedTree(child, walk, nodesById, svgReconstructable);
    }
    return;
  }

  pushElement(walk, node.tagName);
  if (node.text !== undefined) walk.text.push(node.text);
  if (node.tagName === 'a' && node.attributes.href !== undefined) {
    walk.links.push(node.attributes.href);
  }

  for (const childId of node.childNodeIds) {
    const child = nodesById.get(childId);
    if (child !== undefined) walkCapturedTree(child, walk, nodesById, svgReconstructable);
  }
}

/** Reconstructed-side walk over the parsed document's body. */
function walkParsedTree(element: Element, walk: ParityWalk): void {
  for (const child of Array.from(element.children)) {
    const tag = child.tagName.toLowerCase();
    pushElement(walk, tag);

    if (tag === 'a' && child.getAttribute('href') !== null) {
      walk.links.push(child.getAttribute('href') ?? '');
    }

    // Direct text only — the capture model stores per-node direct text.
    if (!TEXTLESS_TAGS.has(tag)) {
      for (const node of Array.from(child.childNodes)) {
        if (node.nodeType === 3 /* TEXT_NODE */ && (node.nodeValue ?? '').trim() !== '') {
          walk.text.push(node.nodeValue ?? '');
        }
      }
    }

    if (!TEXTLESS_TAGS.has(tag)) walkParsedTree(child, walk);
  }
}

/**
 * Compares the captured tree against reconstructed HTML using a DOM parser.
 * Pure function; requires a DOM implementation (browser/jsdom).
 */
export function compareStructure(capture: CaptureResult, html: string): StructureParityReport {
  const nodesById = new Map(capture.nodes.map((node) => [node.nodeId, node]));
  const root = capture.nodes[0];
  const parsed = new DOMParser().parseFromString(html, 'text/html');

  const svgReconstructable = new Set<number>();
  for (const asset of capture.assets) {
    if (
      asset.kind === 'svg-inline' &&
      asset.nodeId !== null &&
      !svgReconstructable.has(asset.nodeId)
    ) {
      svgReconstructable.add(asset.nodeId);
    }
  }

  const expected = createWalk();
  const reconstructed = createWalk();

  if (root !== undefined) {
    let contentNodeIds: readonly number[] = [];
    if (root.tagName === 'html') {
      const rootChildren = root.childNodeIds
        .map((id) => nodesById.get(id))
        .filter((node): node is CapturedNode => node !== undefined);
      const body = rootChildren.find((node) => node.tagName === 'body');
      contentNodeIds =
        body !== undefined
          ? body.childNodeIds
          : rootChildren.filter((node) => node.tagName !== 'head').map((node) => node.nodeId);
    } else {
      contentNodeIds = [root.nodeId];
      expected.tags.push(root.tagName); // root renders as an ordinary element
      expected.elements += 1;
    }
    for (const childId of contentNodeIds) {
      const child = nodesById.get(childId);
      if (child !== undefined) walkCapturedTree(child, expected, nodesById, svgReconstructable);
    }
  }

  walkParsedTree(parsed.body, reconstructed);

  const expectedText = stripWhitespace(expected.text.join(''));
  const reconstructedText = stripWhitespace(reconstructed.text.join(''));

  const sequencesEqual = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((value, index) => value === b[index]);

  const tagSequenceMatches = sequencesEqual(expected.tags, reconstructed.tags);
  const elementRatio = expected.elements > 0 ? reconstructed.elements / expected.elements : null;

  const headingsMatch = sequencesEqual(expected.headings, reconstructed.headings);
  const linksMatch = sequencesEqual(expected.links, reconstructed.links);
  const interactiveMatch = expected.interactive === reconstructed.interactive;
  const imagesMatch = expected.images === reconstructed.images;
  const textMatches = expectedText === reconstructedText;

  return {
    capturedElements: expected.elements,
    reconstructedElements: reconstructed.elements,
    elementRatio,
    tagSequenceMatches,
    textMatches,
    headingsMatch,
    linksMatch,
    interactiveMatch,
    imagesMatch,
    withinTolerance:
      tagSequenceMatches &&
      textMatches &&
      headingsMatch &&
      linksMatch &&
      interactiveMatch &&
      imagesMatch,
  };
}
