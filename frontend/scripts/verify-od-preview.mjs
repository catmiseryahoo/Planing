import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const previewPath = resolve(frontendDir, 'od-preview-built.html');
const html = readFileSync(previewPath, 'utf8');
const moduleOpen = '<script>';
const headEnd = html.indexOf('</head>');
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const bundleMatch = inlineScripts.find((match) => match[1].length > 500_000);
const moduleStart = bundleMatch?.index ?? -1;
const moduleClose = bundleMatch ? moduleStart + bundleMatch[0].length - '</script>'.length : -1;
const styleStart = html.indexOf('<style>');
const moduleBody = moduleStart >= 0 && moduleClose >= 0
  ? html.slice(moduleStart + moduleOpen.length, moduleClose)
  : '';
const head = headEnd >= 0 ? html.slice(0, headEnd) : html;
const beforeModule = moduleStart >= 0 ? html.slice(0, moduleStart) : head;
const previewFlag = 'window.__OD_PREVIEW__ = true;';
const rootIndex = html.indexOf('<div id="root">');
const bodyCloseIndex = html.indexOf('</body>');

const checks = {
  nonEmpty: html.length > 500_000,
  oneInlineStyle: html.match(/<style>/g)?.length === 1,
  oneInlineBundle: moduleStart >= 0,
  styleOutsideModule: head.includes('<style>') && moduleStart >= 0
    && styleStart < moduleStart && styleStart < headEnd,
  noExternalStylesheet: !/<link\b[^>]*rel="stylesheet"/.test(head),
  noExternalModule: !/<script\b[^>]*src=/.test(beforeModule),
  noClosingTagInModule: !moduleBody.includes('</script>'),
  styleOutsideBundle: styleStart >= 0 && moduleStart >= 0
    && (styleStart < moduleStart || styleStart > moduleClose),
  bundleAfterRoot: rootIndex >= 0 && moduleStart > rootIndex && moduleClose < bodyCloseIndex,
  previewFlagBeforeBundle: head.indexOf(previewFlag) >= 0
    && head.indexOf(previewFlag) < moduleStart,
  containsPalette: html.includes('#f2f5f9') && html.includes('#6366f1'),
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) {
  console.error(`OD preview verification failed: ${failed.join(', ')}`);
  process.exit(1);
}

console.log(`OD preview verified: ${html.length} bytes, ${Object.keys(checks).length}/${Object.keys(checks).length} checks passed`);
