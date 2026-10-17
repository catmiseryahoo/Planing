#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const node = process.execPath;
const vite = resolve(frontendDir, 'node_modules/vite/bin/vite.js');
const productionCheckDir = resolve(frontendDir, '.production-check');
const run = (args, env = process.env) => execFileSync(node, args, { cwd: frontendDir, env, stdio: 'inherit' });

try {
  rmSync(productionCheckDir, { recursive: true, force: true });
  console.log('=== Production safety check (isolated output) ===');
  run([vite, 'build', '--outDir', '.production-check'], { ...process.env, VITE_SUPABASE_URL: '' });
  run([resolve(frontendDir, 'scripts/verify-production-safe.mjs')], { ...process.env, PRODUCTION_DIST_DIR: productionCheckDir });

  console.log('=== Native Open Design preview ===');
  run([resolve(frontendDir, 'scripts/build-od-native-preview.mjs')]);
  run([resolve(frontendDir, 'scripts/verify-od-native-preview.mjs')]);
  run([resolve(frontendDir, 'scripts/verify-od-visualization-preview.mjs')]);
  console.log('OD workflow preflight passed. frontend/dist is now the native OD preview; production check was isolated.');
} finally {
  rmSync(productionCheckDir, { recursive: true, force: true });
}
