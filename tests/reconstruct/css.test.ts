import { beforeEach, describe, expect, it } from 'vitest';
import { resetDom } from '../helpers/dom';
import { reconstructCapture } from '@/shared/reconstruct';
import {
  captureCurrent,
  fixtureHostileStyles,
  fixtureLayoutPage,
  fixturePseudoElements,
} from './fixtures';

beforeEach(() => {
  resetDom();
});

function cssFor(body: string): string {
  resetDom('', body);
  return reconstructCapture(captureCurrent()).css;
}

describe('reconstruction — CSS rendering', () => {
  it('emits declarations from captured computed styles, in whitelist order', () => {
    const css = cssFor('<div style="color: rgb(1, 2, 3); display: flex; gap: 8px;">x</div>');
    const rule = css.slice(css.indexOf('.pc-n'));
    const colorIndex = rule.indexOf('color: rgb(1, 2, 3);');
    const displayIndex = rule.indexOf('display: flex;');
    const gapIndex = rule.indexOf('gap: 8px;');
    expect(displayIndex).toBeGreaterThan(-1);
    expect(gapIndex).toBeGreaterThan(displayIndex); // layout before flex group
    expect(colorIndex).toBeGreaterThan(gapIndex); // visual after flex
  });

  it('keeps the visual character of the captured page (fixture B)', () => {
    const css = reconstructCapture(fixtureLayoutPage()).css;
    expect(css).toContain('display: flex;');
    expect(css).toContain('flex-direction: column;');
    expect(css).toContain('display: grid;');
    expect(css).toContain('background-color: rgb(18, 20, 23);');
    expect(css).toContain('border-radius: 10px;');
  });

  it('reconstructs typography properties', () => {
    resetDom(
      '',
      [
        '<h1 style="font-size: 40px; font-weight: 700; text-align: center;">T</h1>',
        '<p style="line-height: 1.6; text-transform: uppercase;">x</p>',
      ].join(''),
    );
    const css = reconstructCapture(captureCurrent()).css;
    expect(css).toContain('font-size: 40px;');
    expect(css).toContain('font-weight: 700;');
    expect(css).toContain('text-align: center;');
    expect(css).toContain('line-height: 1.6;');
    expect(css).toContain('text-transform: uppercase;');
  });

  it('reconstructs backgrounds, borders, shadows and opacity', () => {
    resetDom(
      '',
      [
        '<div style="',
        'background-color: rgb(18, 20, 23);',
        'background-image: url(/img/pattern.png);',
        'background-size: cover;',
        'background-position: center;',
        'background-repeat: no-repeat;',
        'border: 2px solid rgb(35, 39, 45);',
        'border-radius: 12px;',
        'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);',
        'opacity: 0.9;',
        '">x</div>',
      ].join(''),
    );
    const css = reconstructCapture(captureCurrent()).css;
    expect(css).toContain('background-color: rgb(18, 20, 23);');
    expect(css).toContain('background-image: url("https://example.com/img/pattern.png");');
    expect(css).toContain('background-size: cover;');
    expect(css).toContain('background-repeat: no-repeat;');
    expect(css).toContain('border: 2px solid rgb(35, 39, 45);');
    expect(css).toContain('border-radius: 12px;');
    expect(css).toContain('box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);');
    expect(css).toContain('opacity: 0.9;');
  });

  it('emits layout properties and avoids absolute positioning unless captured', () => {
    resetDom(
      '',
      [
        '<div style="display: flex; position: relative; gap: 4px;">',
        '<span style="position: absolute; top: 10px; left: 20px;">a</span>',
        '</div>',
      ].join(''),
    );
    const css = reconstructCapture(captureCurrent()).css;
    expect(css).toContain('display: flex;');
    expect(css).toContain('position: relative;');
    expect(css).toContain('position: absolute;');
    expect(css).toContain('top: 10px;');
    expect(css).toContain('left: 20px;');
    expect(css).not.toContain('position: absolute; }'); // only where captured
  });

  it('skips no-op captured values to keep output bounded', () => {
    resetDom('', '<div style="opacity: 1; transform: none; visibility: visible;">x</div>');
    const css = reconstructCapture(captureCurrent()).css;
    expect(css).not.toContain('opacity');
    expect(css).not.toContain('transform');
    expect(css).not.toContain('visibility');
  });

  it('never pins viewport-derived dimensions on html/body', () => {
    resetDom('', '<p>x</p>');
    const result = reconstructCapture(captureCurrent());
    // Hand-pin the shell dimensions to prove the rule (defensive fixture).
    const pinned = reconstructCapture({
      ...captureCurrent(),
      nodes: captureCurrent().nodes.map((node) =>
        node.tagName === 'html' || node.tagName === 'body'
          ? { ...node, styles: { ...node.styles, width: '800px', height: '600px' } }
          : node,
      ),
    });
    expect(pinned.css).not.toMatch(/^(\s*)width: 800px;/m);
    expect(pinned.css).not.toMatch(/^(\s*)height: 600px;/m);
    expect(result.css).toBeDefined();
  });

  it('drops hostile style values with a warning (fixture F2)', () => {
    const result = reconstructCapture(fixtureHostileStyles());
    // None of the injected fragments survive; braces stay balanced.
    expect(result.css).not.toContain('expression(');
    expect(result.css).not.toContain('display: none');
    expect(result.css).not.toContain('body {');
    const open = (result.css.match(/\{/g) ?? []).length;
    const close = (result.css.match(/\}/g) ?? []).length;
    expect(open).toBe(close);
    expect(result.warnings.some((warning) => warning.code === 'STYLE_PROPERTY_OMITTED')).toBe(true);
    // Safe declarations of the same nodes still survive.
    expect(result.css).toContain('color: rgb(0, 128, 0);');
    expect(result.css).toContain('transform: translateX(10px) rotate(3deg);');
  });

  it('re-serializes background URLs as quoted absolute references', () => {
    const css = cssFor('<div style="background-image: url(&quot;/img/x.png&quot;);">x</div>');
    expect(css).toContain('url("https://example.com/img/x.png")');
  });

  it('keeps external background references external (no downloading)', () => {
    const css = cssFor(
      '<div style="background-image: url(https://cdn.example.com/i.png);">x</div>',
    );
    expect(css).toContain('url("https://cdn.example.com/i.png")');
    const warning = reconstructCapture(captureCurrent()).warnings.find(
      (entry) => entry.code === 'EXTERNAL_ASSET_REFERENCE',
    );
    expect(warning?.count).toBeGreaterThanOrEqual(1);
  });

  it('orders rules by node id (deterministic output)', () => {
    const css = reconstructCapture(fixtureLayoutPage()).css;
    const ids = [...css.matchAll(/\.pc-n(\d+) \{/g)].map((match) => Number(match[1]));
    const sorted = [...ids].sort((a, b) => a - b);
    expect(ids).toEqual(sorted);
  });

  it('emits pseudo-element rules with sanitized content (fixture G)', () => {
    const css = reconstructCapture(fixturePseudoElements()).css;
    expect(css).toContain('.pc-n2::before');
    expect(css).toContain('content: "“";');
    expect(css).toContain('.pc-n3::after');
    expect(css).toContain('content: "NEW";');
    expect(css).toContain('background-color: rgb(37, 99, 235);');
  });

  it('respects includeStyles=false (no stylesheet, no generated classes)', () => {
    const result = reconstructCapture(fixtureLayoutPage(), { includeStyles: false });
    expect(result.css).toBe('');
    expect(result.html).not.toContain('pc-n');
    expect(result.statistics.styleRules).toBe(0);
  });
});
