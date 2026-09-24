import { beforeEach, describe, expect, it } from 'vitest';
import { capture, findByTag, resetDom } from './helpers/dom';

beforeEach(() => {
  resetDom();
});

describe('capture — interactive elements', () => {
  it('captures button structure without executing anything', () => {
    resetDom('', '<button type="submit" disabled>Send</button>');
    const result = capture();
    const button = findByTag(result, 'button');
    expect(button.attributes).toMatchObject({ type: 'submit', disabled: '' });
    expect(button.semantic.interactive).toBe(true);
    expect(button.text).toBe('Send');
  });

  it('captures input structure without values', () => {
    resetDom(
      '',
      '<form><input type="email" name="email" placeholder="you@example.com" value="secret@example.com"></form>',
    );
    const result = capture();
    const input = findByTag(result, 'input');
    expect(input.attributes).toMatchObject({
      type: 'email',
      name: 'email',
      placeholder: 'you@example.com',
    });
    expect(input.attributes.value).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('secret@example.com');
    expect(result.security.formValuesOmitted).toBeGreaterThan(0);
  });

  it('captures checkbox and radio structure', () => {
    resetDom('', '<input type="checkbox" checked><input type="radio" name="opt">');
    const result = capture();
    const [checkbox, radio] = result.nodes.filter((n) => n.tagName === 'input');
    expect(checkbox?.attributes.type).toBe('checkbox');
    expect(checkbox?.attributes.checked).toBe('');
    expect(radio?.attributes.type).toBe('radio');
    expect(radio?.attributes.name).toBe('opt');
  });

  it('captures select and textarea structure', () => {
    resetDom(
      '',
      '<select name="choice"><option value="a">A</option></select><textarea rows="3">default text</textarea>',
    );
    const result = capture();

    const select = findByTag(result, 'select');
    expect(select.attributes.name).toBe('choice');

    const option = findByTag(result, 'option');
    expect(option.attributes.value).toBeUndefined(); // option value is form data
    expect(option.text).toBe('A'); // visible label is fine

    const textarea = findByTag(result, 'textarea');
    expect(textarea.attributes.rows).toBeUndefined(); // rows not on allow-list
    expect(textarea.text).toBeUndefined(); // default value never captured
    // option's `value` attribute is redacted; textarea text is excluded by tag policy
    expect(result.security.formValuesOmitted).toBeGreaterThanOrEqual(1);
  });

  it('captures anchors as interactive', () => {
    resetDom('', '<a href="https://example.com/">home</a>');
    expect(findByTag(capture(), 'a').semantic.interactive).toBe(true);
  });
});
