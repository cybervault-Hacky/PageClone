/**
 * Capture engine orchestrator: walks the rendered DOM and produces the
 * versioned, JSON-serializable CaptureResult.
 *
 * Pipeline (security boundary enforced):
 *   DOM → raw inspection → sanitizeAttributes / normalizeText / SVG sanitizer
 *      → normalized CapturedNodes + assets + links → statistics
 *
 * The engine never modifies the page, never follows links, and never reads
 * cookies, storage, form values or credentials.
 */
import {
  CAPTURE_LIMITS,
  CAPTURE_RESULT_VERSION,
  INTERACTIVE_TAGS,
  SKIPPED_TAGS,
  TEXT_EXCLUDED_TAGS,
} from '@/shared/constants/capture';
import {
  countPasswordField,
  createSecurityCounters,
  normalizeText,
  sanitizeAttributes,
  toSecuritySummary,
} from '@/shared/security/redact';
import type {
  CaptureOptions,
  CaptureResult,
  CaptureWarning,
  CaptureWarningCode,
  CapturedNode,
  LinkReference,
  PseudoElementStyle,
} from '@/shared/types/capture';
import { getHostname, resolveFaviconUrl, resolveSafeResourceUrl } from '@/shared/utils/url';
import {
  collectBackgroundAsset,
  collectImageAssets,
  collectSvgAsset,
  createAssetCollector,
} from './assets';
import { readPseudoStyles, readWhitelistedStyles } from './styles';

const HEADING_LEVELS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface WalkState {
  readonly nodes: CapturedNode[];
  readonly links: LinkReference[];
  readonly warnings: Map<CaptureWarningCode, string>;
  skipped: number;
  textCharacters: number;
  styledElements: number;
  images: number;
  svgs: number;
  totalTextBudget: number;
  readonly deadline: number;
  readonly now: () => number;
  timedOut: boolean;
  readonly baseHref: string;
}

function warn(state: WalkState, code: CaptureWarningCode, message: string): void {
  if (!state.warnings.has(code)) state.warnings.set(code, message);
}

function isSvgRoot(element: Element): boolean {
  return element.namespaceURI === SVG_NAMESPACE && element.localName.toLowerCase() === 'svg';
}

function readComputed(view: Window | null, element: Element): CSSStyleDeclaration | null {
  if (view === null) return null;
  try {
    return view.getComputedStyle(element);
  } catch {
    return null;
  }
}

function captureText(
  element: Element,
  tag: string,
  options: CaptureOptions,
  state: WalkState,
): string | undefined {
  if (!options.includeText || TEXT_EXCLUDED_TAGS.includes(tag)) return undefined;
  if (state.totalTextBudget <= 0) return undefined;

  let rawText = '';
  for (const child of element.childNodes) {
    if (child.nodeType === 3 /* TEXT_NODE */) rawText += child.nodeValue ?? '';
  }
  if (rawText.trim() === '') return undefined;

  const allowed = Math.min(options.maxTextLength, state.totalTextBudget);
  const text = normalizeText(rawText, allowed);
  if (text === '') return undefined;

  state.textCharacters += text.length;
  state.totalTextBudget -= text.length;
  if (state.totalTextBudget <= 0) {
    warn(state, 'text-limit', 'Text capture reached its total limit.');
  }
  return text;
}

function walk(
  element: Element,
  parentId: number | null,
  depth: number,
  options: CaptureOptions,
  state: WalkState,
  counters: ReturnType<typeof createSecurityCounters>,
  collector: ReturnType<typeof createAssetCollector>,
): number | null {
  const tag = element.localName.toLowerCase();

  if (SKIPPED_TAGS.includes(tag)) {
    state.skipped += 1;
    return null;
  }

  if (depth > CAPTURE_LIMITS.maxDepth) {
    state.skipped += 1;
    warn(state, 'depth-limit', 'Some deeply nested content was skipped.');
    return null;
  }

  if (state.nodes.length >= options.maxElements) {
    warn(state, 'element-limit', 'This page has more elements than the capture limit.');
    return null;
  }

  // Periodic duration check keeps very large pages from hanging the tab.
  // The root node is always attempted so a partial result has a tree anchor.
  if (state.nodes.length > 0 && state.nodes.length % 50 === 0 && state.now() > state.deadline) {
    state.timedOut = true;
    warn(state, 'duration-limit', 'Capture stopped after reaching the time limit.');
    return null;
  }

  const nodeId = state.nodes.length;

  // --- raw inspection → sanitization (security boundary) ---
  const rawAttributes: Array<readonly [string, string]> = [];
  for (let i = 0; i < element.attributes.length; i += 1) {
    const attr = element.attributes.item(i);
    if (attr !== null) rawAttributes.push([attr.name, attr.value]);
  }
  const attributes = sanitizeAttributes(tag, rawAttributes, counters, state.baseHref);
  countPasswordField(tag, attributes, counters);

  // --- text, styles, layout (collected before the node is assembled) ---
  const text = captureText(element, tag, options, state);

  const view = element.ownerDocument.defaultView;
  const computed = readComputed(view, element);

  let styles: Record<string, string> | undefined;
  if (options.includeStyles && computed !== null) {
    const read = readWhitelistedStyles(computed);
    if (Object.keys(read).length > 0) {
      styles = read;
      state.styledElements += 1;
    }
  }

  if (options.includeBackgroundImages && computed !== null) {
    const bg = computed.getPropertyValue('background-image');
    if (bg !== '' && bg !== 'none') {
      collectBackgroundAsset(bg, nodeId, state.baseHref, collector);
    }
  }

  const pseudo: { before?: PseudoElementStyle; after?: PseudoElementStyle } | undefined =
    options.includePseudoElements ? readPseudoStyles(element) : undefined;

  const rect = element.getBoundingClientRect();
  const layout = {
    x: round2(rect.x),
    y: round2(rect.y),
    width: round2(rect.width),
    height: round2(rect.height),
  };

  const semantic = {
    interactive:
      INTERACTIVE_TAGS.includes(tag) ||
      (typeof attributes.role === 'string' &&
        ['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem'].includes(
          attributes.role,
        )),
    headingLevel: HEADING_LEVELS.has(tag) ? Number(tag.slice(1)) : null,
  };

  // --- svg: sanitized markup asset, never descended into ---
  if (isSvgRoot(element)) {
    if (options.includeSvg) {
      const outcome = collectSvgAsset(element, nodeId, collector);
      counters.svgScriptsRemoved += outcome.scriptsRemoved;
      counters.eventHandlerAttributesDropped += outcome.eventHandlersDropped;
      counters.unsafeUrlsSanitized += outcome.urlsSanitized;
      state.svgs += 1;
      state.nodes.push({
        nodeId,
        parentId,
        childNodeIds: [],
        tagName: tag,
        attributes,
        layout,
        semantic,
        svg: true,
        ...(text !== undefined ? { text } : {}),
        ...(styles !== undefined ? { styles } : {}),
      });
    } else {
      state.skipped += 1;
    }
    return nodeId;
  }

  // --- image discovery ---
  if (options.includeImages && (tag === 'img' || tag === 'source')) {
    const before = collector.count();
    collectImageAssets(element, nodeId, state.baseHref, collector);
    if (collector.count() > before) state.images += 1;
  }

  // --- assemble node ---
  const childNodeIds: number[] = [];
  state.nodes.push({
    nodeId,
    parentId,
    childNodeIds,
    tagName: tag,
    attributes,
    semantic,
    layout,
    ...(text !== undefined ? { text } : {}),
    ...(styles !== undefined ? { styles } : {}),
    ...(pseudo !== undefined ? { pseudo } : {}),
  });

  // --- links ---
  if (options.includeLinks && tag === 'a') {
    const href = attributes.href ?? '';
    if (href !== '') {
      state.links.push({
        nodeId,
        href,
        target: attributes.target ?? null,
        rel: attributes.rel ?? null,
        text: normalizeText(element.textContent ?? '', options.maxTextLength),
      });
    }
  }

  // --- descend ---
  if (!state.timedOut) {
    for (const child of Array.from(element.children)) {
      if (state.nodes.length >= options.maxElements) {
        warn(state, 'element-limit', 'This page has more elements than the capture limit.');
        break;
      }
      const childId = walk(child, nodeId, depth + 1, options, state, counters, collector);
      if (childId !== null) childNodeIds.push(childId);
      if (state.timedOut) break;
    }
  }

  return nodeId;
}

function findFavicon(doc: Document, baseHref: string): string | null {
  const links = Array.from(doc.querySelectorAll('link[rel]'));
  for (const link of links) {
    const rel = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('icon')) continue;
    const href = link.getAttribute('href');
    if (href === null) continue;
    const safe = resolveSafeResourceUrl(href, baseHref);
    const resolved = resolveFaviconUrl(safe);
    if (resolved !== null) return resolved;
  }
  return null;
}

/**
 * Base URL for resolving relative references: honours a <base href> when the
 * document declares one, otherwise the captured page URL (which equals
 * `location.href` in the real content script).
 */
function resolveBaseHref(doc: Document, pageUrl: string): string {
  const baseElement = doc.querySelector('base[href]');
  const raw = baseElement?.getAttribute('href');
  if (raw !== undefined && raw !== null && raw.trim() !== '') {
    try {
      return new URL(raw.trim(), pageUrl).href;
    } catch {
      return pageUrl;
    }
  }
  return pageUrl;
}

export interface CaptureDeps {
  readonly now?: () => number;
}

/** Captures the given document into a bounded, normalized CaptureResult. */
export function captureDocument(
  options: CaptureOptions,
  pageUrl: string,
  doc: Document = document,
  deps: CaptureDeps = {},
): CaptureResult {
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  const deadline = startedAt + CAPTURE_LIMITS.maxDurationMs;
  const counters = createSecurityCounters();
  const collector = createAssetCollector(options.maxAssets);
  const baseHref = resolveBaseHref(doc, pageUrl);

  const state: WalkState = {
    nodes: [],
    links: [],
    warnings: new Map(),
    skipped: 0,
    textCharacters: 0,
    styledElements: 0,
    images: 0,
    svgs: 0,
    totalTextBudget: options.maxTotalText,
    deadline,
    now,
    timedOut: false,
    baseHref,
  };

  walk(doc.documentElement, null, 0, options, state, counters, collector);

  if (collector.count() >= options.maxAssets) {
    warn(state, 'asset-limit', 'Some assets were skipped because the asset limit was reached.');
  }

  const durationMs = Math.max(0, now() - startedAt);
  const warnings: CaptureWarning[] = Array.from(state.warnings.entries()).map(
    ([code, message]) => ({ code, message }),
  );

  const docElement = doc.documentElement;
  let direction: 'ltr' | 'rtl' = 'ltr';
  try {
    const view = doc.defaultView;
    if (view !== null && view.getComputedStyle(docElement).direction === 'rtl') {
      direction = 'rtl';
    }
  } catch {
    /* keep default */
  }

  const result: CaptureResult = {
    version: CAPTURE_RESULT_VERSION,
    capturedAt: Date.now(),
    page: {
      url: pageUrl,
      hostname: getHostname(pageUrl) ?? '',
      title: doc.title !== '' ? doc.title : null,
      language: docElement.getAttribute('lang') ?? '',
      direction,
      faviconUrl: findFavicon(doc, baseHref),
    },
    viewport: {
      width: Math.max(0, Math.round(doc.defaultView?.innerWidth ?? 0)),
      height: Math.max(0, Math.round(doc.defaultView?.innerHeight ?? 0)),
      devicePixelRatio: doc.defaultView?.devicePixelRatio ?? 1,
      scrollWidth: Math.max(0, docElement.scrollWidth),
      scrollHeight: Math.max(0, docElement.scrollHeight),
    },
    nodes: state.nodes,
    assets: collector.assets,
    links: state.links,
    statistics: {
      elementsCaptured: state.nodes.length,
      elementsSkipped: state.skipped,
      images: state.images,
      svgs: state.svgs,
      styledElements: state.styledElements,
      links: state.links.length,
      assetsDiscovered: collector.count(),
      textCharactersCaptured: state.textCharacters,
      truncated: warnings.length > 0,
      durationMs,
      serializedBytes: 0, // measured below once the payload is assembled
    },
    warnings,
    security: toSecuritySummary(counters),
  };

  const serializedBytes = JSON.stringify(result).length;
  return {
    ...result,
    statistics: { ...result.statistics, serializedBytes },
  };
}
