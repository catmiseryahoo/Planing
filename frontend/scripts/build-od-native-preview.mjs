import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = resolve(frontendDir, 'node_modules/vite/bin/vite.js');
const buildConfig = resolve(frontendDir, 'od-native-preview.vite.config.js');

execFileSync(process.execPath, [viteBin, 'build', '--config', buildConfig], {
  cwd: frontendDir,
  stdio: 'inherit',
});

console.log('Published native OD Vite preview: ' + resolve(frontendDir, 'dist/index.html'));
