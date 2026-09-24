/**
 * Post-build validation: ensures dist/ is a browser-loadable extension.
 * Fails the build (exit 1) when required files are missing or the manifest
 * references something that does not exist.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(repoRoot, 'dist');

const failures = [];

function fail(message) {
  failures.push(message);
}

function rel(filePath) {
  return path.relative(repoRoot, filePath);
}

if (!existsSync(distDir)) {
  console.error('verify-dist: dist/ does not exist — run vite build first.');
  process.exit(1);
}

// --- manifest ---------------------------------------------------------------

const manifestPath = path.join(distDir, 'manifest.json');
if (!existsSync(manifestPath)) {
  fail('dist/manifest.json is missing');
} else {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`dist/manifest.json is not valid JSON: ${error.message}`);
  }

  if (manifest) {
    if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
    if (!manifest.name) fail('manifest.name is missing');
    if (!manifest.version) fail('manifest.version is missing');

    const requireFile = (fromManifest, label) => {
      const filePath = path.join(distDir, fromManifest);
      if (!existsSync(filePath)) fail(`${label} references missing file: ${fromManifest}`);
    };

    if (manifest.action?.default_popup) {
      requireFile(manifest.action.default_popup, 'action.default_popup');
    } else {
      fail('action.default_popup is missing');
    }

    if (manifest.background?.service_worker) {
      requireFile(manifest.background.service_worker, 'background.service_worker');
    } else {
      fail('background.service_worker is missing');
    }

    for (const [size, iconPath] of Object.entries(manifest.icons ?? {})) {
      requireFile(iconPath, `icons[${size}]`);
    }

    // Least-privilege guard: Phase 1 may only ask for "tabs".
    const allowed = new Set(['tabs']);
    for (const permission of manifest.permissions ?? []) {
      if (!allowed.has(permission)) fail(`unexpected permission in manifest: ${permission}`);
    }
    if (manifest.host_permissions?.length) {
      fail('host_permissions must stay empty until a later phase enables them');
    }
    if (manifest.content_scripts?.length) {
      fail('content_scripts must stay unset until a later phase enables them');
    }
  }
}

// --- popup html ---------------------------------------------------------------

const popupHtmlPath = path.join(distDir, 'popup.html');
if (!existsSync(popupHtmlPath)) {
  fail('dist/popup.html is missing');
} else {
  const html = readFileSync(popupHtmlPath, 'utf8');
  const scriptMatches = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)];
  if (scriptMatches.length === 0) {
    fail('popup.html references no scripts');
  }
  for (const [, src] of scriptMatches) {
    if (src.startsWith('http')) continue;
    const assetPath = path.join(distDir, src.replace(/^\//, ''));
    if (!existsSync(assetPath)) fail(`popup.html references missing asset: ${src}`);
  }
}

// --- report -------------------------------------------------------------------

if (failures.length > 0) {
  console.error('verify-dist: FAILED');
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`verify-dist: OK — loadable extension at ${rel(distDir)}/`);
