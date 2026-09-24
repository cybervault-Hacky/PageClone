import { beforeEach, describe, expect, it } from 'vitest';
import { CAPTURE_RESULT_VERSION } from '@/shared/constants/capture';
import { capture, findByTag, resetDom, TEST_PAGE_URL } from './helpers/dom';

beforeEach(() => {
  resetDom();
});

describe('capture — DOM structure', () => {
  it('produces a versioned result with page metadata', () => {
    resetDom('', '<p>Hi</p>');
    document.documentElement.setAttribute('lang', 'en');
    document.title = 'Docs Page';

    const result = capture();

    expect(result.version).toBe(CAPTURE_RESULT_VERSION);
    expect(result.page.url).toBe(TEST_PAGE_URL);
    expect(result.page.hostname).toBe('example.com');
    expect(result.page.title).toBe('Docs Page');
    expect(result.page.language).toBe('en');
    expect(result.page.direction).toBe('ltr');
    expect(typeof result.capturedAt).toBe('number');
  });

  it('captures a basic tree with parent/child relationships', () => {
    resetDom('', '<div id="a"><span id="b">text</span></div>');
    const result = capture();

    const root = result.nodes[0];
    expect(root).toBeDefined();
    if (!root) return;
    expect(root.tagName).toBe('html');
    expect(root.parentId).toBeNull();

    const div = findByTag(result, 'div');
    const span = findByTag(result, 'span');

    expect(div.parentId).not.toBeNull();
    expect(span.parentId).toBe(div.nodeId);
    expect(div.childNodeIds).toContain(span.nodeId);
    // every node id is unique and sequential
    const ids = result.nodes.map((n) => n.nodeId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(0);
  });

  it('walks nested elements in document order', () => {
    resetDom('', '<section><article><h2>Title</h2><p>Body</p></article></section>');
    const result = capture();
    const tags = result.nodes.map((n) => n.tagName);
    expect(tags.indexOf('section')).toBeLessThan(tags.indexOf('article'));
    expect(tags.indexOf('article')).toBeLessThan(tags.indexOf('h2'));
    expect(tags.indexOf('h2')).toBeLessThan(tags.indexOf('p'));
  });

  it('captures heading semantics and interactive flags', () => {
    resetDom('', '<h1>Big</h1><button>Go</button><div role="button">R</div><span>x</span>');
    const result = capture();

    expect(findByTag(result, 'h1').semantic).toEqual({ interactive: false, headingLevel: 1 });
    expect(findByTag(result, 'button').semantic.interactive).toBe(true);
    expect(findByTag(result, 'div').semantic.interactive).toBe(true); // role=button
    expect(findByTag(result, 'span').semantic.interactive).toBe(false);
  });

  it('normalizes whitespace in text and stores it on the parent node', () => {
    resetDom('', '<p>  Hello   \n  world  </p>');
    const result = capture();
    expect(findByTag(result, 'p').text).toBe('Hello world');
  });

  it('does not descend into script/style/template content', () => {
    resetDom(
      '',
      '<style>.x{color:red}</style><script>var secretToken = "abc";</script><template><i>t</i></template><p>ok</p>',
    );
    const result = capture();

    expect(result.nodes.find((n) => n.tagName === 'script')).toBeUndefined();
    expect(result.nodes.find((n) => n.tagName === 'style')).toBeUndefined();
    expect(result.nodes.find((n) => n.tagName === 'template')).toBeUndefined();
    expect(result.nodes.find((n) => n.tagName === 'i')).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('secretToken');
    expect(JSON.stringify(result)).not.toContain('color:red');
    expect(result.statistics.elementsSkipped).toBeGreaterThanOrEqual(3);
    expect(findByTag(result, 'p').text).toBe('ok');
  });

  it('does not capture comments as nodes', () => {
    resetDom('', '<div><!-- note --><p>visible</p></div>');
    const result = capture();
    expect(result.nodes.every((n) => n.tagName !== '#comment')).toBe(true);
    expect(findByTag(result, 'p').text).toBe('visible');
  });

  it('captures safe structural attributes only', () => {
    resetDom(
      '',
      '<a id="link" class="btn primary" role="link" aria-label="Go" href="https://example.com/x" target="_blank" rel="noopener">Go</a>',
    );
    const result = capture();
    const a = findByTag(result, 'a');
    expect(a.attributes).toEqual({
      id: 'link',
      class: 'btn primary',
      role: 'link',
      'aria-label': 'Go',
      href: 'https://example.com/x',
      target: '_blank',
      rel: 'noopener',
    });
  });

  it('records document viewport and dimensions as numbers', () => {
    resetDom('', '<p>x</p>');
    const result = capture();
    for (const [key, value] of Object.entries(result.viewport)) {
      expect(typeof value, `${key} must be a number`).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(result.viewport.devicePixelRatio).toBeGreaterThan(0);
  });

  it('captures bounding-rectangle layout for every node', () => {
    resetDom('', '<div><span>deep</span></div>');
    const result = capture();
    for (const node of result.nodes) {
      expect(node.layout).toBeDefined();
      for (const value of Object.values(node.layout ?? {})) {
        expect(typeof value).toBe('number');
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
});
