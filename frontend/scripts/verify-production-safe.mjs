#!/usr/bin/env node

/**
 * verify-production-safe.mjs
 *
 * CRITICAL: Production guard — проверяет, что frontend/dist не содержит
 * preview-флаг, мок-данные или OD_PREVIEW_SESSION.
 *
 * Запуск:
 *   cd frontend && VITE_SUPABASE_URL= npm run build
 *   /home/catmiser/.hermes/node/bin/node scripts/verify-production-safe.mjs
 *
 * Выход: 0 если все проверки PASS, 1 если хотя бы одна FAIL.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');

let exitCode = 0;
const checks = [];

function check(name, ok) {
  checks.push({ name, ok });
  if (!ok) exitCode = 1;
}

// 1. dist/ существует
if (!existsSync(distDir)) {
  console.error('FAIL: dist/ не найдена. Сначала выполни production build.');
  process.exit(1);
}

// 2. dist/index.html
const distHtml = readFileSync(resolve(distDir, 'index.html'), 'utf8');
check('dist/index.html не содержит __OD_PREVIEW__', !distHtml.includes('__OD_PREVIEW__'));
check('dist/index.html не содержит VITE_OD_PREVIEW', !distHtml.includes('VITE_OD_PREVIEW'));
check('dist/index.html содержит type="module"', distHtml.includes('type="module"'));
check('dist/index.html содержит crossorigin', distHtml.includes('crossorigin'));

// 3. dist/assets/
const assetsDir = resolve(distDir, 'assets');
if (!existsSync(assetsDir)) {
  console.error('FAIL: dist/assets/ не найдена.');
  process.exit(1);
}

const jsFiles = readdirSync(assetsDir).filter(f => f.endsWith('.js'));
const cssFiles = readdirSync(assetsDir).filter(f => f.endsWith('.css'));

check('dist/assets/ содержит JS файлы', jsFiles.length > 0);
check('dist/assets/ содержит CSS файлы', cssFiles.length > 0);

// 4. Проверка каждого JS файла (только основной app-бандл, не библиотеки)
for (const jsFile of jsFiles) {
  const content = readFileSync(resolve(assetsDir, jsFile), 'utf8');
  const name = `dist/assets/${jsFile}`;
  const isMainBundle = jsFile.startsWith('index-') || jsFile.startsWith('od-preview');

  check(`${name}: не содержит design-preview@example.local`,
    !content.includes('design-preview@example.local'));
  check(`${name}: не содержит OD_PREVIEW_SESSION`,
    !content.includes('OD_PREVIEW_SESSION'));
  check(`${name}: не содержит OD_PREVIEW_DATA`,
    !content.includes('OD_PREVIEW_DATA'));
  check(`${name}: не содержит window.__OD_PREVIEW__`,
    !content.includes('window.__OD_PREVIEW__'));

  // signInWithPassword проверяем только в основном бандле
  if (isMainBundle) {
    check(`${name}: содержит signInWithPassword (auth function)`,
      content.includes('signInWithPassword'));
  }
}

// 5. Проверка CSS файлов (на всякий случай)
for (const cssFile of cssFiles) {
  const content = readFileSync(resolve(assetsDir, cssFile), 'utf8');
  const name = `dist/assets/${cssFile}`;
  check(`${name}: не содержит __OD_PREVIEW__`,
    !content.includes('__OD_PREVIEW__'));
}

// 6. Проверка source index.html (на будущее)
try {
  const srcHtml = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
  check('source index.html не содержит __OD_PREVIEW__', !srcHtml.includes('__OD_PREVIEW__'));
} catch { /* skip */ }

// === Отчёт ===
console.log('\n=== Production Safety Guard ===');
console.log(`Проверок: ${checks.length}`);
console.log('');

let passed = 0, failed = 0;
for (const { name, ok } of checks) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (ok) passed++; else failed++;
}

console.log(`\nРезультат: ${passed}/${checks.length} PASS, ${failed} FAIL`);

if (exitCode === 0) {
  console.log('\n✓ Production bundle безопасен. Можно деплоить.');
} else {
  console.log('\n✗ Production bundle СОДЕРЖИТ preview-данные. Деплой запрещён!');
  console.log('  Проверь: frontend/index.html, vite.config.js, App.jsx IS_OD_PREVIEW');
}

process.exit(exitCode);
