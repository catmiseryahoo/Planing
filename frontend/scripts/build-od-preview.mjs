import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = resolve(frontendDir, 'node_modules/vite/bin/vite.js');
const buildConfig = resolve(frontendDir, 'od-preview.vite.config.js');
const builtEntry = resolve(frontendDir, 'od-preview-build/od-preview.html');
const publishedEntry = resolve(frontendDir, 'od-preview-built.html');
const assetsDir = resolve(frontendDir, 'od-preview-build/assets');

execFileSync(process.execPath, [viteBin, 'build', '--config', buildConfig], {
  cwd: frontendDir,
  stdio: 'inherit',
});

const assetFiles = readdirSync(assetsDir);
const jsFiles = assetFiles.filter((name) => name.endsWith('.js'));
const cssFiles = assetFiles.filter((name) => name.endsWith('.css'));
if (jsFiles.length !== 1 || cssFiles.length !== 1) {
  throw new Error('Expected exactly one JS and one CSS asset, got ' + jsFiles.length + ' JS / ' + cssFiles.length + ' CSS');
}

// The bundle is inserted as a normal classic script. Escape any literal
// closing </script> tag text so the HTML parser cannot terminate the script
// early. The JS bundle may contain bare </script> in template literals
// (React dev-mode error formatting, framer-motion string generation, etc.).
const js = readFileSync(resolve(assetsDir, jsFiles[0]), 'utf8')
  .replace(/<\/script/gi, '\\u003c/script');
const css = readFileSync(resolve(assetsDir, cssFiles[0]), 'utf8');
const inlineBundle = '<script>' + js + '</script>';
let html = readFileSync(builtEntry, 'utf8');
const stylesheetTag = /<link[^>]*rel="stylesheet"[^>]*>/;
const moduleScriptTag = /<script[^>]*src="[^"]+"[^>]*><\/script>/;
if (!stylesheetTag.test(html) || !moduleScriptTag.test(html)) {
  throw new Error('Vite entry is missing the expected stylesheet or module script tag');
}
html = html
  .replace(stylesheetTag, () => '<style>' + css + '</style>')
  .replace(moduleScriptTag, () => inlineBundle);

// Vite puts the entry script in <head>, but React mounts into #root.
// Move the bundle after #root so powered/iframe previews have a mount target.
const bodyClose = '</body>';
const bundleIndex = html.indexOf(inlineBundle);
const bodyCloseIndex = html.indexOf(bodyClose);
if (bundleIndex < 0 || bodyCloseIndex < 0 || bundleIndex > bodyCloseIndex) {
  throw new Error('Published preview is missing the expected body/bundle order');
}
html = html.slice(0, bundleIndex) + html.slice(bundleIndex + inlineBundle.length);
const adjustedBodyCloseIndex = html.indexOf(bodyClose);
html = html.slice(0, adjustedBodyCloseIndex) + inlineBundle + '\n  ' + html.slice(adjustedBodyCloseIndex);

const bundleStart = html.indexOf(inlineBundle);
const bundleClose = bundleStart >= 0
  ? bundleStart + inlineBundle.length - '</script>'.length
  : -1;
const styleStart = html.indexOf('<style>');
const headEnd = html.indexOf('</head>');
const rootIndex = html.indexOf('<div id="root">');
const finalBodyCloseIndex = html.indexOf('</body>');
if (
  !html.includes('<style>')
  || bundleStart < 0
  || bundleClose < 0
  || styleStart > bundleStart && styleStart < bundleClose
  || rootIndex < 0
  || bundleStart < rootIndex
  || bundleClose > finalBodyCloseIndex
  || html.indexOf('window.__OD_PREVIEW__ = true;') > bundleStart
  || js.includes('</script>')
) {
  throw new Error('Published preview has an invalid inline style/script boundary');
}

if (!html.includes('<style>') || !html.includes('<script>')) {
  throw new Error('Published preview still contains external asset references');
}

mkdirSync(dirname(publishedEntry), { recursive: true });
writeFileSync(publishedEntry, html, 'utf8');

console.log('Published OD preview: ' + publishedEntry);
