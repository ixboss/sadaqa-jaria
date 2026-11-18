#!/usr/bin/env node
// ============================================================================
// build-pages.mjs — Stages the v2 Golden Reference PWA (apps/web-desktop)
// into dist/pages/ so it deploys cleanly at any subpath (e.g. /sadaqa-jaria/)
// on GitHub Pages with offline Service Worker, sqlite-wasm, QPC1/UthmanicHafs
// fonts, and bundled starter audio.
// ============================================================================
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEB = join(ROOT, 'apps', 'web-desktop');
const OUT = join(ROOT, 'dist', 'pages');

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1. Copy apps/web-desktop/ -> dist/pages/
cpSync(WEB, OUT, { recursive: true });

// 2. Copy shared packages needed at runtime
const pkgCopy = [
  ['packages/design-tokens/tokens.css', 'packages/design-tokens/tokens.css'],
  ['packages/core-data/build/sadaqa.db', 'packages/core-data/build/sadaqa.db'],
  ['packages/core-data/engines', 'packages/core-data/engines'],
  ['packages/core-data/vendor/adhan', 'packages/core-data/vendor/adhan'],
];
for (const [srcRel, dstRel] of pkgCopy) {
  const src = join(ROOT, srcRel);
  if (!existsSync(src)) throw new Error(`Missing required Pages asset: ${srcRel}`);
  const dst = join(OUT, dstRel);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
}

// 3. Copy icons + SEO files + .nojekyll
if (existsSync(join(ROOT, 'icons'))) {
  cpSync(join(ROOT, 'icons'), join(OUT, 'icons'), { recursive: true });
}
for (const f of ['robots.txt', 'sitemap.xml']) {
  if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(OUT, f));
}
writeFileSync(join(OUT, '.nojekyll'), '');

// 4. Rewrite ../../packages/ & ../../icons/ references (exact 2-level lift)
//    so every file under dist/pages/ resolves relative to the deployed root
//    (e.g. https://ixboss.github.io/sadaqa-jaria/).
const TEXT_EXTS = new Set(['.html', '.js', '.mjs', '.css', '.json']);
function rewriteTree(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      rewriteTree(full);
      continue;
    }
    if (!TEXT_EXTS.has(extname(name))) continue;
    const raw = readFileSync(full, 'utf8');
    // Remove exactly two `../` hops before packages/ or icons/
    const next = raw
      .replace(/\.\.\/\.\.\/((?:\.\.\/)*)(packages|icons)\//g, '$1$2/');
    if (next !== raw) writeFileSync(full, next, 'utf8');
  }
}
rewriteTree(OUT);

// 5. Verify every SW SHELL entry and critical runtime asset actually exists in OUT
const requiredAssets = [
  'vendor/sqlite-wasm/index.mjs',
  'vendor/sqlite-wasm/sqlite3.wasm',
  'packages/core-data/build/sadaqa.db',
  'packages/design-tokens/tokens.css',
  'assets/fonts/uthmanic/UthmanicHafs1Ver18.woff2',
  'assets/audio/catalog.json',
  'icons/icon-192.png',
];
const swSrc = readFileSync(join(OUT, 'sw.js'), 'utf8');
const shellMatch = swSrc.match(/const SHELL = \[([\s\S]*?)\];/);
if (shellMatch) {
  for (const m of shellMatch[1].matchAll(/'([^']+)'/g)) {
    requiredAssets.push(m[1]);
  }
}
const missing = [...new Set(requiredAssets)].filter((rel) => !existsSync(join(OUT, rel)));
if (missing.length > 0) {
  throw new Error(`dist/pages is missing required runtime/SW assets:\n  - ${missing.join('\n  - ')}`);
}

console.log(`✔ Staged GitHub Pages v2 PWA in ${OUT} (${new Set(requiredAssets).size} assets verified)`);
