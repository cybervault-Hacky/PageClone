import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { capture, dump, resetDom } from './helpers/dom';

/**
 * MANDATORY security regression suite.
 *
 * These tests make it impossible for later phases to accidentally
 * reintroduce credential capture. Every assertion here must stay green.
 */

interface AccessorSpy {
  cookieReads: number;
  storageReads: number;
  indexedDbReads: number;
  restore: () => void;
}

function installStorageSpies(): AccessorSpy {
  const spy: AccessorSpy = {
    cookieReads: 0,
    storageReads: 0,
    indexedDbReads: 0,
    restore: () => undefined,
  };

  const documentProto = Document.prototype as unknown as Record<string, PropertyDescriptor>;
  const originalCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  Object.defineProperty(documentProto, 'cookie', {
    configurable: true,
    get() {
      spy.cookieReads += 1;
      return '';
    },
    set() {
      spy.cookieReads += 1;
    },
  });

  const originalGetItem = Storage.prototype.getItem;
  Object.defineProperty(Storage.prototype, 'getItem', {
    configurable: true,
    value(this: Storage, key: string) {
      spy.storageReads += 1;
      return originalGetItem.call(this, key);
    },
  });
  const originalLength = Object.getOwnPropertyDescriptor(Storage.prototype, 'length');
  Object.defineProperty(Storage.prototype, 'length', {
    configurable: true,
    get() {
      spy.storageReads += 1;
      return originalLength?.get?.call(this) ?? 0;
    },
  });

  const hadIndexedDb = Object.prototype.hasOwnProperty.call(globalThis, 'indexedDB');
  const originalIndexedDb = (globalThis as Record<string, unknown>).indexedDB;
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    get() {
      spy.indexedDbReads += 1;
      return originalIndexedDb;
    },
  });

  spy.restore = () => {
    if (originalCookie) Object.defineProperty(Document.prototype, 'cookie', originalCookie);
    Object.defineProperty(Storage.prototype, 'getItem', originalGetItem);
    if (originalLength) Object.defineProperty(Storage.prototype, 'length', originalLength);
    if (hadIndexedDb) {
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: originalIndexedDb,
        writable: true,
      });
    } else {
      delete (globalThis as Record<string, unknown>).indexedDB;
    }
  };

  return spy;
}

let spy: AccessorSpy;

beforeEach(() => {
  spy = installStorageSpies();
  resetDom();
});

afterEach(() => {
  spy.restore();
});

describe('security — credential redaction (regression, mandatory)', () => {
  it('never captures password field values, even as attributes', () => {
    resetDom('', '<input type="password" name="pw" value="SECRET" placeholder="Password">');
    const result = capture();
    const serialized = dump(result);

    expect(serialized).not.toContain('SECRET');
    expect(result.security.passwordFieldsOmitted).toBe(1);
    // structure is still represented
    const input = result.nodes.find((n) => n.tagName === 'input');
    expect(input?.attributes.type).toBe('password');
    expect(input?.attributes.placeholder).toBe('Password');
    expect(input?.attributes.value).toBeUndefined();
  });

  it('never captures password values set only via the DOM property', () => {
    resetDom('', '<input type="password" id="pw">');
    const input = document.getElementById('pw') as HTMLInputElement;
    input.value = 'PROP_SECRET'; // property, not attribute
    const serialized = dump(capture());
    expect(serialized).not.toContain('PROP_SECRET');
  });

  it('never captures personal form values (email, text, hidden, token fields)', () => {
    resetDom(
      '',
      [
        '<form>',
        '<input type="email" value="secret@example.com">',
        '<input type="text" value="John Doe">',
        '<input type="hidden" name="csrf" value="tok_abc123">',
        '<textarea>private message</textarea>',
        '<input type="checkbox" checked value="yes">',
        '</form>',
      ].join(''),
    );
    const result = capture();
    const serialized = dump(result);

    expect(serialized).not.toContain('secret@example.com');
    expect(serialized).not.toContain('John Doe');
    expect(serialized).not.toContain('tok_abc123');
    expect(serialized).not.toContain('private message');
    expect(serialized).not.toContain('"value":"yes"');
    expect(result.security.formValuesOmitted).toBeGreaterThanOrEqual(4);
  });

  it('never captures OTP-like autocomplete fields with values', () => {
    resetDom('', '<input type="text" autocomplete="one-time-code" value="493821">');
    const serialized = dump(capture());
    expect(serialized).not.toContain('493821');
  });

  it('never reads cookies', () => {
    resetDom('', '<p>page</p>');
    capture();
    expect(spy.cookieReads).toBe(0);
  });

  it('never reads localStorage or sessionStorage', () => {
    resetDom('', '<p>page</p>');
    window.localStorage.setItem('session', 'tok_local');
    window.sessionStorage.setItem('session', 'tok_session');
    const result = capture();
    expect(spy.storageReads).toBe(0);
    expect(dump(result)).not.toContain('tok_local');
    expect(dump(result)).not.toContain('tok_session');
    expect(result.security.storageAccessed).toBe(false);
  });

  it('never reads IndexedDB', () => {
    resetDom('', '<p>page</p>');
    capture();
    expect(spy.indexedDbReads).toBe(0);
  });

  it('never captures inline event-handler source', () => {
    resetDom('', '<button onclick="stealTokens(\'secret\')" onmouseover="doEvil()">Click</button>');
    const result = capture();
    const serialized = dump(result);
    expect(serialized).not.toContain('stealTokens');
    expect(serialized).not.toContain('doEvil');
    expect(serialized).not.toMatch(/"on[a-z]+":/);
    expect(result.security.eventHandlerAttributesDropped).toBeGreaterThanOrEqual(2);
  });

  it('never captures authorization/authentication metadata attributes', () => {
    resetDom(
      '',
      '<div data-auth="Bearer xyz" authorization="Bearer abc" x-session="s3cr3t">x</div>',
    );
    const serialized = dump(capture());
    expect(serialized).not.toContain('Bearer xyz');
    expect(serialized).not.toContain('Bearer abc');
    expect(serialized).not.toContain('s3cr3t');
  });

  it('sanitizes unsafe SVG content (scripts, handlers, javascript hrefs)', () => {
    resetDom(
      '',
      [
        '<svg>',
        '<script>exfiltrate(document.cookie)</script>',
        '<a href="javascript:evil()"><circle r="5"/></a>',
        '<rect onclick="evil()" width="10" height="10"/>',
        '</svg>',
      ].join(''),
    );
    const result = capture();
    const serialized = dump(result);

    expect(serialized).not.toContain('exfiltrate');
    expect(serialized).not.toContain('javascript:evil');
    expect(serialized).not.toMatch(/onclick/);
    expect(result.security.svgScriptsRemoved).toBeGreaterThanOrEqual(1);
  });

  it('records declared non-access invariants in the security summary', () => {
    resetDom('', '<p>x</p>');
    const result = capture();
    expect(result.security.cookiesAccessed).toBe(false);
    expect(result.security.storageAccessed).toBe(false);
  });

  it('keeps the serialized result free of obvious secret-shaped values', () => {
    resetDom(
      '',
      [
        '<input type="password" value="hunter2">',
        '<input value="4111111111111111">', // credit-card shaped
        '<input type="text" value="cvv-123">',
      ].join(''),
    );
    const serialized = dump(capture());
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('4111111111111111');
    expect(serialized).not.toContain('cvv-123');
  });
});
