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

  it('requests exactly ["tabs"] and no host permissions (Phase 2)', () => {
    expect(manifest.permissions).toEqual(['tabs']);
    expect(manifest.host_permissions).toBeUndefined();
    expect((manifest as unknown as Record<string, unknown>).optional_permissions).toBeUndefined();
  });

  it('registers exactly one content script on http/https only', () => {
    const scripts = manifest.content_scripts as Array<{
      matches: string[];
      exclude_matches?: string[];
      js: string[];
      run_at: string;
      all_frames: boolean;
    }>;
    expect(Array.isArray(scripts)).toBe(true);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.matches).toEqual(['http://*/*', 'https://*/*']);
    expect(scripts[0]?.js).toEqual(['content.js']);
    expect(scripts[0]?.run_at).toBe('document_idle');
    expect(scripts[0]?.all_frames).toBe(false);
  });

  it('excludes extension stores and never matches restricted schemes', () => {
    const script = (
      manifest.content_scripts as Array<{
        matches: string[];
        exclude_matches?: string[];
      }>
    )[0];
    expect(script?.exclude_matches).toContain('https://chromewebstore.google.com/*');
    expect(script?.exclude_matches).toContain('https://chrome.google.com/webstore/*');
    for (const match of script?.matches ?? []) {
      expect(match.startsWith('http://') || match.startsWith('https://')).toBe(true);
    }
  });

  it('declares no web accessible resources', () => {
    expect(
      (manifest as unknown as Record<string, unknown>).web_accessible_resources,
    ).toBeUndefined();
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
