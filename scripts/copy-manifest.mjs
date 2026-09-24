/**
 * Copies the source manifest (extension/src/manifest/chrome.json) into dist/
 * after the Vite build. Keeping the manifest as an editable source file means
 * lint/tests can validate it; Vite does not process JSON referenced only by
 * the build pipeline.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repoRoot, 'extension', 'src', 'manifest', 'chrome.json');
const distDir = path.join(repoRoot, 'dist');
const target = path.join(distDir, 'manifest.json');

mkdirSync(distDir, { recursive: true });
copyFileSync(source, target);
console.log('manifest: copied to dist/manifest.json');
