/**
 * Deterministic reconstruction fixtures (A–H).
 *
 * DOM-driven fixtures run the REAL Phase 2 capture against a jsdom document
 * and feed the result to the real reconstruction engine (end-to-end).
 * Hand-built fixtures exercise security/style edge cases the Phase 2 capture
 * would already strip — proving the reconstruction layer defends itself.
 */
import { DEFAULT_CAPTURE_OPTIONS } from '@/shared/constants/capture';
import type { CaptureOptions, CaptureResult, PseudoElementStyle } from '@/shared/types';
import { captureDocument } from '@/content/engine/capture';
import { TEST_PAGE_URL } from '../helpers/dom';

/** Captures the current jsdom document against the standard test URL. */
export function captureCurrent(options: Partial<CaptureOptions> = {}): CaptureResult {
  return captureDocument({ ...DEFAULT_CAPTURE_OPTIONS, ...options }, TEST_PAGE_URL, document);
}

function setBody(bodyHtml: string, headHtml = ''): void {
  document.head.innerHTML = headHtml;
  document.body.innerHTML = bodyHtml;
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
  document.title = '';
}

export interface Fixture {
  readonly name: string;
  readonly capture: CaptureResult;
}

/** A — simple page: header / main / h1 / p / button / footer. */
export function fixtureSimplePage(): CaptureResult {
  setBody(
    [
      '<header class="site-header"><span>PageClone</span></header>',
      '<main>',
      '<h1>Welcome</h1>',
      '<p>A simple page with &lt;escaped&gt; characters &amp; entities.</p>',
      '<button type="button">Get started</button>',
      '</main>',
      '<footer><small>Built with PageClone</small></footer>',
    ].join(''),
  );
  document.documentElement.setAttribute('lang', 'en');
  document.title = 'Simple Page';
  return captureCurrent();
}

/** B — layout page: flex rows, a CSS grid, nested cards. */
export function fixtureLayoutPage(): CaptureResult {
  setBody(
    [
      '<div class="layout" style="display: flex; flex-direction: column; gap: 12px;">',
      '<div class="row" style="display: flex; gap: 8px;">',
      '<div class="card" style="background-color: rgb(18, 20, 23); border-radius: 10px; padding: 16px;">Card A</div>',
      '<div class="card" style="border: 1px solid rgb(35, 39, 45);">Card B</div>',
      '</div>',
      '<div class="grid" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px;">',
      '<section class="tile"><h2>Tile 1</h2><p>Copy</p></section>',
      '<section class="tile"><h2>Tile 2</h2><p>Copy</p></section>',
      '</div>',
      '</div>',
    ].join(''),
  );
  return captureCurrent();
}

/** C — typography: sizes, weights, line heights, transforms, alignment. */
export function fixtureTypographyPage(): CaptureResult {
  setBody(
    [
      '<article>',
      '<h1 style="font-size: 40px; font-weight: 700; text-align: center;">Display</h1>',
      '<p style="font-size: 14px; line-height: 1.6; letter-spacing: 0.02em;">Body copy</p>',
      '<p style="text-transform: uppercase; font-weight: 600;">eyebrow</p>',
      '<blockquote style="font-size: 20px; color: rgb(90, 90, 90);">Quote</blockquote>',
      '</article>',
    ].join(''),
  );
  return captureCurrent();
}

/** D — assets: raster image, inline SVG, picture/source, background image. */
export function fixtureAssetPage(): CaptureResult {
  setBody(
    [
      '<figure>',
      '<img src="/img/hero.png" alt="Hero" width="640" height="360">',
      '<figcaption>Hero image</figcaption>',
      '</figure>',
      '<picture><source srcset="/img/wide.png" media="(min-width: 600px)"><img src="/img/fallback.png" alt="Fallback"></picture>',
      '<svg viewBox="0 0 24 24" class="icon"><path d="M4 4h16v16H4z"></path></svg>',
      '<div class="bg" style="background-image: url(&quot;/img/pattern.png&quot;); background-size: cover;"></div>',
    ].join(''),
  );
  return captureCurrent();
}

/** E — interactive: forms, inputs, selects, links (structural only). */
export function fixtureInteractivePage(): CaptureResult {
  setBody(
    [
      '<form class="signup">',
      '<label for="email">Email</label>',
      '<input id="email" type="email" placeholder="you@example.com" required>',
      '<textarea name="msg" placeholder="Message"></textarea>',
      '<select name="plan"><option value="free" selected>Free</option><option value="pro">Pro</option></select>',
      '<button type="submit">Sign up</button>',
      '</form>',
      '<nav><a href="https://example.com/docs">Docs</a><a href="/pricing">Pricing</a></nav>',
    ].join(''),
  );
  return captureCurrent();
}

/** H — complex nested tree: deep, mixed semantic elements. */
export function fixtureNestedTreePage(): CaptureResult {
  setBody(
    [
      '<main>',
      '<header><nav><ul><li><a href="#a">A</a></li><li><a href="#b">B</a></li></ul></nav></header>',
      '<section id="s1">',
      '<article><h2>Article</h2>',
      '<div><div><div><p>Deep <strong>bold <em>italic</em></strong> text</p></div></div></div>',
      '<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Ada</td></tr></tbody></table>',
      '</article>',
      '</section>',
      '<aside><ul><li>One</li><li>Two</li></ul></aside>',
      '<footer><p>© 2026</p></footer>',
      '</main>',
    ].join(''),
  );
  return captureCurrent();
}

// --- hand-built fixtures (security / pseudo / style edge cases) -------------

/** Minimal valid CaptureResult scaffold with a single html root. */
export function emptyCapture(): CaptureResult {
  return {
    version: 1,
    capturedAt: 0,
    page: {
      url: TEST_PAGE_URL,
      hostname: 'example.com',
      title: null,
      language: '',
      direction: 'ltr',
      faviconUrl: null,
    },
    viewport: { width: 800, height: 600, devicePixelRatio: 1, scrollWidth: 800, scrollHeight: 600 },
    nodes: [
      {
        nodeId: 0,
        parentId: null,
        childNodeIds: [1],
        tagName: 'html',
        attributes: {},
        semantic: { interactive: false, headingLevel: null },
      },
      {
        nodeId: 1,
        parentId: 0,
        childNodeIds: [],
        tagName: 'body',
        attributes: {},
        semantic: { interactive: false, headingLevel: null },
      },
    ],
    assets: [],
    links: [],
    statistics: {
      elementsCaptured: 2,
      elementsSkipped: 0,
      images: 0,
      svgs: 0,
      styledElements: 0,
      links: 0,
      assetsDiscovered: 0,
      textCharactersCaptured: 0,
      truncated: false,
      durationMs: 0,
      serializedBytes: 0,
    },
    warnings: [],
    security: {
      formValuesOmitted: 0,
      passwordFieldsOmitted: 0,
      eventHandlerAttributesDropped: 0,
      unsafeUrlsSanitized: 0,
      svgScriptsRemoved: 0,
      cookiesAccessed: false,
      storageAccessed: false,
    },
  };
}

export function nodeWithAttributes(
  nodeId: number,
  parentId: number | null,
  tagName: string,
  attributes: Record<string, string>,
  extra: Partial<CaptureResult['nodes'][number]> = {},
): CaptureResult['nodes'][number] {
  return {
    nodeId,
    parentId,
    childNodeIds: [],
    tagName,
    attributes,
    semantic: { interactive: false, headingLevel: null },
    ...extra,
  };
}

/** F — security: hostile attributes/URLs/styles the capture layer missed. */
export function fixtureHostileCapture(): CaptureResult {
  const base = emptyCapture();
  const html = base.nodes[0];
  const body = base.nodes[1];
  if (html === undefined || body === undefined) throw new Error('invalid fixture');
  return {
    ...base,
    nodes: [
      { ...html, childNodeIds: [1, 2, 3, 4, 5, 6, 7] },
      { ...body, parentId: 0, childNodeIds: [2, 3, 4, 5, 6, 7] },
      nodeWithAttributes(2, 1, 'script', {}, { attributes: {} }),
      nodeWithAttributes(3, 1, 'a', {
        href: 'javascript:steal()',
        onclick: 'evil()',
        title: 'click',
      }),
      nodeWithAttributes(4, 1, 'img', { src: 'vbscript:evil', onerror: 'evil()' }),
      nodeWithAttributes(5, 1, 'input', { type: 'password', value: 'hunter2' }),
      nodeWithAttributes(6, 1, 'div', {
        style: 'color: red',
        'data-token': 'secret',
        class: 'legit',
      }),
      nodeWithAttributes(7, 1, 'span', {}, { text: '<script>alert(1)</script>' }),
    ],
    assets: [],
    links: [],
  };
}

/** F2 — hostile styles: CSS injection attempts through captured values. */
export function fixtureHostileStyles(): CaptureResult {
  const base = emptyCapture();
  const html = base.nodes[0];
  const body = base.nodes[1];
  if (html === undefined || body === undefined) throw new Error('invalid fixture');
  return {
    ...base,
    nodes: [
      { ...html, childNodeIds: [1, 2, 3, 4] },
      { ...body, parentId: 0, childNodeIds: [2, 3, 4] },
      nodeWithAttributes(
        2,
        1,
        'div',
        {},
        {
          styles: {
            color: 'red } body { background: url(javascript:evil) }',
            background: 'red; } * { display: none',
          },
        },
      ),
      nodeWithAttributes(
        3,
        1,
        'p',
        {},
        {
          styles: {
            'background-image': 'url("javascript:alert(1)")',
            width: 'expression(alert(2))',
            'font-family': 'Arial; } body { display: none }',
          },
        },
      ),
      nodeWithAttributes(
        4,
        1,
        'span',
        {},
        {
          styles: {
            color: 'rgb(0, 128, 0)',
            'background-image': 'url("https://images.example.com/bg.png")',
            transform: 'translateX(10px) rotate(3deg)',
          },
        },
      ),
    ],
  };
}

/** G — pseudo elements: ::before/::after with content. */
export function fixturePseudoElements(): CaptureResult {
  const base = emptyCapture();
  const html = base.nodes[0];
  const body = base.nodes[1];
  if (html === undefined || body === undefined) throw new Error('invalid fixture');
  const quotePseudo: PseudoElementStyle = {
    hasContent: true,
    content: '"“"',
    color: 'rgb(136, 136, 136)',
    backgroundColor: null,
    backgroundImage: null,
    fontSize: '32px',
    fontWeight: '700',
    position: 'absolute',
    top: '-16px',
    left: '-8px',
    width: null,
    height: null,
    lineHeight: null,
    border: null,
    borderRadius: null,
    transform: null,
  };
  const badgePseudo: PseudoElementStyle = {
    hasContent: true,
    content: '"NEW"',
    color: 'rgb(255, 255, 255)',
    backgroundColor: 'rgb(37, 99, 235)',
    backgroundImage: null,
    display: 'inline-block',
    borderRadius: '4px',
  };
  const brokenPseudo: PseudoElementStyle = {
    hasContent: true,
    content: null, // captured before Phase 3 stored the string
    color: 'rgb(0, 0, 0)',
    backgroundColor: null,
    backgroundImage: null,
  };
  return {
    ...base,
    nodes: [
      { ...html, childNodeIds: [1, 2, 3, 4] },
      { ...body, parentId: 0, childNodeIds: [2, 3, 4] },
      nodeWithAttributes(
        2,
        1,
        'blockquote',
        { class: 'quote' },
        {
          pseudo: { before: quotePseudo },
        },
      ),
      nodeWithAttributes(
        3,
        1,
        'span',
        { class: 'badge' },
        {
          pseudo: { after: badgePseudo },
        },
      ),
      nodeWithAttributes(4, 1, 'p', {}, { pseudo: { before: brokenPseudo } }),
    ],
  };
}

/** G2 — pseudo content that must be dropped (non-string computed value). */
export function fixtureHostilePseudoContent(): CaptureResult {
  const base = fixturePseudoElements();
  const html = base.nodes[0];
  const body = base.nodes[1];
  if (html === undefined || body === undefined) throw new Error('invalid fixture');
  return {
    ...base,
    nodes: [
      { ...html, childNodeIds: [1, 2] },
      { ...body, parentId: 0, childNodeIds: [2] },
      nodeWithAttributes(
        2,
        1,
        'div',
        { class: 'evil' },
        {
          pseudo: {
            before: {
              hasContent: true,
              content: '"</style><script>alert(1)</script>"',
              color: null,
              backgroundColor: null,
              backgroundImage: null,
            },
          },
        },
      ),
    ],
  };
}

/** D2 — inline SVG asset (sanitized markup) attached to an svg node. */
export function fixtureSvgInline(): CaptureResult {
  const base = emptyCapture();
  const html = base.nodes[0];
  const body = base.nodes[1];
  if (html === undefined || body === undefined) throw new Error('invalid fixture');
  return {
    ...base,
    nodes: [
      { ...html, childNodeIds: [1, 2, 3] },
      { ...body, parentId: 0, childNodeIds: [2, 3] },
      {
        ...nodeWithAttributes(2, 1, 'svg', { class: 'icon' }, { svg: true }),
        layout: { x: 0, y: 0, width: 24, height: 24 },
      },
      nodeWithAttributes(3, 1, 'svg', {}, { svg: true }),
    ],
    assets: [
      {
        assetId: 0,
        kind: 'svg-inline',
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"></path></svg>',
        nodeId: 2,
        width: 24,
        height: 24,
        alt: null,
      },
    ],
  };
}
