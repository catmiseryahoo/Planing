import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceEntry = readFileSync(resolve(frontendDir, 'index.html'), 'utf8');
const distEntryPath = resolve(frontendDir, 'dist/index.html');
const distEntry = readFileSync(distEntryPath, 'utf8');
const assetsDir = resolve(frontendDir, 'dist/assets');
const assets = readdirSync(assetsDir).filter((name) => statSync(resolve(assetsDir, name)).isFile());

const checks = {
  sourceIsViteEntry: /<script\b[^>]*type=["']module["'][^>]*src=["']\/src\/[^"']+["'][^>]*>\s*<\/script>/i.test(sourceEntry),
  sourceHasRoot: sourceEntry.includes('<div id="root"></div>'),
  distExists: statSync(distEntryPath).isFile(),
  distHasRoot: distEntry.includes('<div id="root"></div>'),
  distUsesBuiltAssets: /(?:src|href)=["']\/assets\/[^"']+["']/i.test(distEntry),
  distHasNoSourceModule: !/<script\b[^>]*src=["']\/src\//i.test(distEntry),
  hasJsAsset: assets.some((name) => name.endsWith('.js')),
  hasCssAsset: assets.some((name) => name.endsWith('.css')),
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) {
  console.error(`Native OD preview verification failed: ${failed.join(', ')}`);
  process.exit(1);
}

console.log(`Native OD preview verified: ${Object.keys(checks).length}/${Object.keys(checks).length} checks passed`);
