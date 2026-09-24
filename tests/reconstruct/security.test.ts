import { beforeEach, describe, expect, it } from 'vitest';
import { resetDom, TEST_PAGE_URL } from '../helpers/dom';
import { reconstructCapture, validateReconstructionResult } from '@/shared/reconstruct';
import {
  captureCurrent,
  emptyCapture,
  fixtureHostileCapture,
  fixtureHostilePseudoContent,
  fixtureHostileStyles,
} from './fixtures';
import type { CaptureResult } from '@/shared/types';

/**
 * MANDATORY Phase 3 security regression suite.
 *
 * Phase 2 guarantees nothing dangerous enters a CaptureResult. This suite
 * proves the reconstruction layer independently enforces the same boundary —
 * even against hand-built captures that bypass the capture engine — and that
 * its *output* can never execute anything.
 */

beforeEach(() => {
  resetDom();
});

function node(
  nodeId: number,
  parentId: number | null,
  tagName: string,
  attributes: Record<string, string> = {},
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

function tree(...body: CaptureResult['nodes']): CaptureResult {
  const base = emptyCapture();
  const html = base.nodes[0];
  const bodyNode = base.nodes[1];
  if (html === undefined || bodyNode === undefined) throw new Error('invalid base');
  const ids = body.map((child) => child.nodeId);
  return {
    ...base,
    nodes: [{ ...html, childNodeIds: [1, ...ids] }, { ...bodyNode, childNodeIds: ids }, ...body],
  };
}

describe('reconstruction security — executable content', () => {
  it('never emits <script>, even from hand-built captures', () => {
    const result = reconstructCapture(
      tree(
        node(2, 1, 'script', {}, { text: 'alert(document.cookie)' }),
        node(3, 1, 'p', {}, { text: 'safe' }),
      ),
    );
    expect(result.html).not.toContain('<script');
    expect(result.html).not.toContain('alert(document.cookie)');
    expect(result.warnings.some((warning) => warning.code === 'UNSAFE_ELEMENT_REMOVED')).toBe(true);
  });

  it('never reconstructs event-handler attributes', () => {
    const result = reconstructCapture(fixtureHostileCapture());
    expect(result.html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(result.html).not.toContain('steal()');
    expect(result.html).not.toContain('evil()');
  });

  it('rejects javascript: hrefs with a warning (fixture F)', () => {
    const result = reconstructCapture(fixtureHostileCapture());
    expect(result.html.toLowerCase()).not.toContain('javascript:');
    expect(result.warnings.some((warning) => warning.code === 'UNSAFE_URL_OMITTED')).toBe(true);
  });

  it('rejects vbscript: and data:text/html sources', () => {
    const result = reconstructCapture(
      tree(
        node(2, 1, 'img', { src: 'vbscript:evil' }),
        node(3, 1, 'img', { src: 'data:text/html,<script>alert(1)</script>' }),
        node(4, 1, 'a', { href: 'data:text/html;base64,PHNjcmlwdD4=' }),
      ),
    );
    expect(result.html).not.toContain('vbscript:');
    expect(result.html).not.toContain('data:text/html');
    expect(result.warnings.some((warning) => warning.code === 'UNSAFE_URL_OMITTED')).toBe(true);
  });

  it('keeps fragment and safe relative navigation working', () => {
    const result = reconstructCapture(
      tree(node(2, 1, 'a', { href: '#section' }), node(3, 1, 'a', { href: '/docs' })),
    );
    expect(result.html).toContain('href="#section"');
    expect(result.html).toContain(`href="https://example.com/docs"`);
  });
});

describe('reconstruction security — credentials & form values', () => {
  it('never reconstructs value attributes (fixture F)', () => {
    const result = reconstructCapture(fixtureHostileCapture());
    expect(result.html).not.toContain('hunter2');
    expect(result.html).not.toContain('value=');
    expect(result.html).toMatch(/<input type="password">/);
  });

  it('never emits captured textarea/option text as values', () => {
    const result = reconstructCapture(
      tree(
        node(2, 1, 'textarea', {}, { text: 'SECRET_MESSAGE' }),
        node(3, 1, 'input', { type: 'text', name: 'a' }),
      ),
    );
    expect(result.html).not.toContain('SECRET_MESSAGE');
    expect(result.html).toMatch(/<textarea[^>]*><\/textarea>/);
    expect(result.warnings.some((warning) => warning.code === 'FORM_VALUE_OMITTED')).toBe(true);
  });

  it('never reintroduces style, data-*, or unknown attributes (fixture F)', () => {
    const result = reconstructCapture(fixtureHostileCapture());
    expect(result.html).not.toContain('style=');
    expect(result.html).not.toContain('data-token');
    expect(result.html).not.toContain('secret');
    expect(result.html).toContain('class="legit"'); // safe classes survive
  });

  it('drops captured values that re-enter via validated output scanning', () => {
    // A password value that somehow reached a title must not survive either.
    const hostile = fixtureHostileCapture();
    const result = reconstructCapture(hostile);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('hunter2');
    expect(validateReconstructionResult(result).ok).toBe(true);
  });
});

describe('reconstruction security — CSS injection', () => {
  it('prevents declaration breakout through captured values (fixture F2)', () => {
    const result = reconstructCapture(fixtureHostileStyles());
    expect(result.css).not.toContain('} body');
    expect(result.css).not.toContain('* { display: none');
    expect(result.css).not.toContain('; }');
    expect(result.css).not.toContain('expression(');
    expect(result.css).not.toContain('javascript:');
    // The stylesheet must remain balanced and structurally valid.
    expect(validateReconstructionResult(result).ok).toBe(true);
  });

  it('prevents pseudo-element content from escaping the style block', () => {
    const result = reconstructCapture(fixtureHostilePseudoContent());
    expect(result.css).not.toContain('<');
    expect(result.css).not.toContain('</style>');
    expect(result.html).not.toContain('<script');
    // The unusable content becomes an empty content box plus a warning.
    expect(result.css).toContain('content: "";');
    expect(result.warnings.some((warning) => warning.code === 'PSEUDO_ELEMENT_UNAVAILABLE')).toBe(
      true,
    );
  });

  it('rejects url() layers with unsafe schemes', () => {
    const result = reconstructCapture(
      tree(
        node(
          2,
          1,
          'div',
          {},
          {
            styles: { 'background-image': 'url("javascript:alert(1)")' },
          },
        ),
      ),
    );
    expect(result.css).not.toContain('javascript:');
    expect(result.warnings.some((warning) => warning.code === 'STYLE_PROPERTY_OMITTED')).toBe(true);
  });

  it('caps runaway values instead of emitting them', () => {
    const longValue = 'a'.repeat(5000);
    const result = reconstructCapture(
      tree(node(2, 1, 'div', {}, { styles: { color: longValue } })),
    );
    expect(result.css).not.toContain(longValue.slice(0, 100));
  });
});

describe('reconstruction security — svg', () => {
  it('refuses inline SVG markup containing scripts (defense in depth)', () => {
    const base = emptyCapture();
    const html = base.nodes[0];
    const body = base.nodes[1];
    if (html === undefined || body === undefined) throw new Error('invalid base');
    const result = reconstructCapture({
      ...base,
      nodes: [
        { ...html, childNodeIds: [1, 2] },
        { ...body, parentId: 0, childNodeIds: [2] },
        node(2, 1, 'svg', {}, { svg: true }),
      ],
      assets: [
        {
          assetId: 0,
          kind: 'svg-inline',
          source: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
          nodeId: 2,
          width: 24,
          height: 24,
          alt: null,
        },
      ],
    });
    expect(result.html).not.toContain('<script');
    expect(result.warnings.some((warning) => warning.code === 'SVG_MARKUP_UNAVAILABLE')).toBe(true);
  });

  it('refuses inline SVG markup with event handlers or unsafe hrefs', () => {
    const base = emptyCapture();
    const html = base.nodes[0];
    const body = base.nodes[1];
    if (html === undefined || body === undefined) throw new Error('invalid base');
    const result = reconstructCapture({
      ...base,
      nodes: [
        { ...html, childNodeIds: [1, 2] },
        { ...body, parentId: 0, childNodeIds: [2] },
        node(2, 1, 'svg', {}, { svg: true }),
      ],
      assets: [
        {
          assetId: 0,
          kind: 'svg-inline',
          source:
            '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:evil()"><rect width="4" height="4"/></a></svg>',
          nodeId: 2,
          width: 24,
          height: 24,
          alt: null,
        },
      ],
    });
    expect(result.html).not.toContain('javascript:');
    expect(result.html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it('externalizes external svg references without downloading (phase 4 boundary)', () => {
    resetDom(
      '',
      '<img src="/img/logo.png" alt="Logo"><div style="background-image: url(/img/bg.png)"></div>',
    );
    const result = reconstructCapture(captureCurrent());
    // References stay external — no data: URLs, no base64, no asset folders.
    expect(result.html).toContain('https://example.com/img/logo.png');
    expect(result.html).not.toMatch(/data:image\/[^;]+;base64/);
    expect(result.warnings.some((warning) => warning.code === 'EXTERNAL_ASSET_REFERENCE')).toBe(
      true,
    );
  });
});

describe('reconstruction security — output validation invariants', () => {
  it('every fixture output passes validateReconstructionResult', () => {
    const results = [
      reconstructCapture(fixtureHostileCapture()),
      reconstructCapture(fixtureHostileStyles()),
      reconstructCapture(fixtureHostilePseudoContent()),
      reconstructCapture(
        tree(
          node(2, 1, 'custom-element', {}, { childNodeIds: [3] }),
          node(3, 1, 'p', {}, { text: 'inside' }),
        ),
      ),
    ];
    for (const result of results) {
      expect(validateReconstructionResult(result).ok).toBe(true);
    }
  });

  it('output text is inert data: escaped markup never executes', () => {
    const result = reconstructCapture(
      tree(node(2, 1, 'p', {}, { text: '<img src=x onerror=alert(1)>' })),
    );
    expect(result.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(result.html).not.toMatch(/<img src=x/);
  });

  it('keeps the documented test-page URL free of credential-shaped data', () => {
    const result = reconstructCapture(fixtureHostileCapture());
    const serialized = JSON.stringify(result);
    for (const secret of ['hunter2', 'SECRET', 'token', 'Bearer', 'authorization']) {
      expect(serialized.toLowerCase()).not.toContain(secret.toLowerCase());
    }
    expect(TEST_PAGE_URL).toBe('https://example.com/docs/page');
  });
});
