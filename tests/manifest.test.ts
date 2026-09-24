import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface ManifestShape {
  manifest_version: number;
  name: string;
  version: string;
  description: string;
  permissions?: string[];
  host_permissions?: string[];
  content_scripts?: unknown[];
  action?: { default_popup?: string; default_title?: string };
  background?: { service_worker?: string };
  icons?: Record<string, string>;
  content_security_policy?: { extension_pages?: string };
}

// NOTE: build paths from fileURLToPath(import.meta.url — never
// `new URL(rel, import.meta.url)`, which Vite rewrites during transform.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(repoRoot, 'extension', 'src', 'manifest', 'chrome.json');
const popupHtmlPath = path.join(repoRoot, 'extension', 'popup.html');

function readIfExists(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

const manifest = JSON.parse(readIfExists(manifestPath)) as ManifestShape;
const popupHtml = readIfExists(popupHtmlPath);

describe('manifest (source of truth)', () => {
  it('is valid Manifest V3 with product identity', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('PageClone');
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.description.length).toBeGreaterThan(0);
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });

  it('requests the minimum Phase 1 permissions', () => {
    expect(manifest.permissions).toEqual(['tabs']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });

  it('declares popup, service worker and icons', () => {
    expect(manifest.action?.default_popup).toBe('popup.html');
    expect(manifest.action?.default_title).toBe('PageClone');
    expect(manifest.background?.service_worker).toBe('background.js');
    expect(Object.keys(manifest.icons ?? {}).sort((a, b) => Number(a) - Number(b))).toEqual([
      '16',
      '32',
      '48',
      '128',
    ]);
  });

  it('ships a strict extension CSP', () => {
    expect(manifest.content_security_policy?.extension_pages).toBe(
      "script-src 'self'; object-src 'self'",
    );
  });

  it('references files that exist in the source tree', () => {
    const popupFile = path.join(repoRoot, 'extension', manifest.action?.default_popup ?? '');
    expect(existsSync(popupFile)).toBe(true);

    const backgroundFile = path.join(repoRoot, 'extension', 'src', 'background', 'index.ts');
    expect(existsSync(backgroundFile)).toBe(true);

    for (const iconPath of Object.values(manifest.icons ?? {})) {
      const iconFile = path.join(repoRoot, 'extension', 'public', iconPath);
      expect(existsSync(iconFile), `missing icon: ${iconPath}`).toBe(true);
    }
  });
});

describe('popup.html (source)', () => {
  it('wires the popup entry point', () => {
    expect(popupHtml).toContain('id="root"');
    expect(popupHtml).toContain('src="/src/popup/main.tsx"');
    expect(popupHtml).toContain('<title>PageClone</title>');
    expect(popupHtml).toContain('lang="en"');
  });
});
