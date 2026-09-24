import { beforeEach, describe, expect, it } from 'vitest';
import { resetDom } from '../helpers/dom';
import { reconstructCapture, validateReconstructionResult } from '@/shared/reconstruct';
import { generatedClassName } from '@/shared/constants/reconstruct';
import {
  captureCurrent,
  fixtureAssetPage,
  fixtureHostileCapture,
  fixtureInteractivePage,
  fixtureLayoutPage,
  fixtureNestedTreePage,
  fixturePseudoElements,
  fixtureSimplePage,
  fixtureSvgInline,
  fixtureTypographyPage,
} from './fixtures';

beforeEach(() => {
  resetDom();
});

describe('reconstruction — HTML tree', () => {
  it('preserves the captured hierarchy (fixture A)', () => {
    const result = reconstructCapture(fixtureSimplePage());

    expect(result.html).toMatch(/<header[\s>]/);
    expect(result.html).toMatch(/<main[\s>]/);
    expect(result.html).toMatch(/<h1[\s>]/);
    expect(result.html).toMatch(/<p[\s>]/);
    expect(result.html).toMatch(/<button[\s>]/);
    expect(result.html).toMatch(/<footer[\s>]/);
    expect(result.html.indexOf('<header')).toBeLessThan(result.html.indexOf('<main'));
    expect(result.html.indexOf('<main')).toBeLessThan(result.html.indexOf('<h1'));
  });

  it('reconstructs deep nested trees in document order (fixture H)', () => {
    const result = reconstructCapture(fixtureNestedTreePage());

    const order = [
      /<main[\s>]/,
      /<header[\s>]/,
      /<nav[\s>]/,
      /<ul[\s>]/,
      /<li[\s>]/,
      /<a[\s>]/,
      /<section[\s>]/,
      /<article[\s>]/,
      /<h2[\s>]/,
      /<table[\s>]/,
      /<aside[\s>]/,
      /<footer[\s>]/,
    ];
    let last = -1;
    for (const marker of order) {
      const html = result.html.slice(last + 1);
      const match = marker.exec(html);
      expect(match).not.toBeNull();
      if (match !== null) last += match.index;
    }
    // Whitespace at element boundaries is collapsed by the capture model —
    // reconstruction is faithful to the captured representation.
    expect(result.html).toMatch(
      /<p class="pc-n\d+">Deep text<strong class="pc-n\d+">bold<em class="pc-n\d+">italic<\/em><\/strong><\/p>/,
    );
  });

  it('renders void elements without closing tags', () => {
    const result = reconstructCapture(fixtureAssetPage());
    expect(result.html).toMatch(/<img [^>]*>/);
    expect(result.html).not.toContain('</img>');
    expect(result.html).not.toContain('</source>');
  });

  it('reconstructs inline SVG from the sanitized asset markup (fixture D2)', () => {
    const result = reconstructCapture(fixtureSvgInline());

    expect(result.html).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">');
    expect(result.statistics.svgInlineReconstructed).toBe(1);
    // The second svg node has no asset → skipped with a warning.
    expect(result.statistics.nodesSkipped).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some((warning) => warning.code === 'SVG_MARKUP_UNAVAILABLE')).toBe(true);
  });

  it('unwraps unknown custom elements, keeps children, warns', () => {
    resetDom('', '<main><fancy-box><p>inner content</p></fancy-box></main>');
    const result = reconstructCapture(captureCurrent());

    expect(result.html).not.toContain('<fancy-box');
    expect(result.html).toMatch(/<p class="pc-n\d+">inner content<\/p>/);
    const unsupported = result.warnings.find((warning) => warning.code === 'UNSUPPORTED_ELEMENT');
    expect(unsupported?.count).toBe(1);
    expect(result.statistics.elementsUnwrapped).toBe(1);
    // The wrapper is skipped, its child is reconstructed.
    expect(result.statistics.nodesSkipped).toBe(1);
  });

  it('drops dangerous elements entirely with a warning', () => {
    const result = reconstructCapture(fixtureHostileCapture());
    expect(result.html).not.toContain('<script');
    const removed = result.warnings.find((warning) => warning.code === 'UNSAFE_ELEMENT_REMOVED');
    expect(removed?.count).toBeGreaterThanOrEqual(1);
  });

  it('assigns deterministic pc-n<nodeId> classes only to nodes with rules', () => {
    const result = reconstructCapture(fixtureSimplePage());
    expect(result.html).toContain(`class="${generatedClassName(0)}"`); // html shell

    // pc-n classes appear in both HTML and CSS, always paired.
    const classMatches = [...result.html.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
      (match[1] ?? '').split(' '),
    );
    const generated = classMatches.filter((token) => token.startsWith('pc-n'));
    for (const token of generated) {
      expect(result.css).toContain(`.${token} `);
    }
    const cssClasses = [...result.css.matchAll(/\.(pc-n\d+)/g)].map((match) => match[1]);
    expect(new Set(cssClasses)).toEqual(new Set(generated));
  });

  it('never emits text for textarea-like elements (form values)', () => {
    const result = reconstructCapture(fixtureInteractivePage());
    expect(/<textarea[^>]*><\/textarea>/.test(result.html)).toBe(true);
  });

  it('escapes captured text as data, never markup', () => {
    const result = reconstructCapture(fixtureSimplePage());
    expect(result.html).toContain('&lt;escaped&gt;');
    expect(result.html).toContain('&amp;');
    expect(result.html).not.toContain('<escaped>');
  });

  it('escapes all five reserved characters in text', () => {
    resetDom('', "<p id='q'>a & b < c > d \" e ' f</p>");
    const result = reconstructCapture(captureCurrent());
    expect(result.html).toContain('a &amp; b &lt; c &gt; d &quot; e &#39; f');
  });

  it('reconstructs form structure without values (fixture E)', () => {
    const result = reconstructCapture(fixtureInteractivePage());
    expect(result.html).toMatch(/<form[\s>]/);
    expect(result.html).toMatch(/<label class="[^"]*" for="email">Email<\/label>/);
    expect(result.html).toMatch(
      /<input id="email" class="[^"]*" type="email" placeholder="you@example\.com"/,
    );
    expect(result.html).toMatch(/<select class="[^"]*" name="plan"[\s>]/);
    expect(result.html).toMatch(/<option class="[^"]*" selected="">Free<\/option>/);
    expect(result.html).not.toContain('value=');
  });

  it('reconstructs pseudo-element hooks (fixture G)', () => {
    const result = reconstructCapture(fixturePseudoElements());
    expect(result.css).toContain('.pc-n2::before');
    expect(result.css).toContain('.pc-n3::after');
    // The pseudo with unavailable content still emits an empty content box.
    expect(result.statistics.pseudoElementsReconstructed).toBe(3);
    const unavailable = result.warnings.find(
      (warning) => warning.code === 'PSEUDO_ELEMENT_UNAVAILABLE',
    );
    expect(unavailable?.count).toBe(1);
  });

  it('produces a self-consistent result across every fixture', () => {
    for (const build of [
      fixtureSimplePage,
      fixtureLayoutPage,
      fixtureTypographyPage,
      fixtureAssetPage,
      fixtureInteractivePage,
      fixtureNestedTreePage,
      fixtureSvgInline,
      fixturePseudoElements,
    ]) {
      const result = reconstructCapture(build());
      expect(validateReconstructionResult(result).ok).toBe(true);
    }
  });
});
