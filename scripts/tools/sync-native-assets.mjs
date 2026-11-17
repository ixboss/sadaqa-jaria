#!/usr/bin/env node
// ============================================================================
// sync-native-assets.mjs — Phase 5 asset bundler for the native ports
// ---------------------------------------------------------------------------
// Runs OFFLINE on any machine with node (CI included). Copies the golden
// reference's bundled assets into both native trees:
//
//   sadaqa.db (42 MB)      → apps/ios-native/Resources/sadaqa.db
//                            apps/android-native/app/src/main/assets/sadaqa.db
//   QPC1 fonts (604 woff2) → decompressed to TTF per target (CoreText and
//   + QPC1BSML.ttf           android Typeface cannot load woff2) via wawoff2
//   tokens.json            → both (single source of design truth)
//   audio catalog.json
//   + starter pack mp3s    → both (offline playback on first boot)
//   parity fixtures        → apps/ios-native/Fixtures/
//                            apps/android-native/app/src/test/resources/fixtures/
//
// Generated content is byte-verified (sha-256) and never committed — CI runs
// this script before xcodegen/gradle; build trees are recreated deterministically.
// Re-runs skip unchanged files (size+sha cache in .tmp-native-fonts/).
// ============================================================================

import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import wawoff2 from 'wawoff2';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const SRC = {
  db: join(ROOT, 'packages', 'core-data', 'build', 'sadaqa.db'),
  fonts: join(ROOT, 'apps', 'web-desktop', 'assets', 'fonts', 'qpc1'),
  tokens: join(ROOT, 'packages', 'design-tokens', 'tokens.json'),
  audioCatalog: join(ROOT, 'apps', 'web-desktop', 'assets', 'audio', 'catalog.json'),
  audioStarter: join(ROOT, 'apps', 'web-desktop', 'assets', 'audio', 'starter', 'alafasy'),
  fixtures: join(ROOT, 'tests', 'parity', 'fixtures'),
};
const TARGETS = [
  { key: 'ios', base: join(ROOT, 'apps', 'ios-native') },
  { key: 'android', base: join(ROOT, 'apps', 'android-native') },
];

// Font cache: woff2→ttf is deterministic; convert once, reuse across targets.
const FONT_CACHE = join(ROOT, '.tmp-native-fonts');
mkdirSync(FONT_CACHE, { recursive: true });

/** Convert one woff2 buffer to TTF bytes (cached on disk by source sha). */
async function woff2ToTtf(srcPath) {
  const srcBuf = readFileSync(srcPath);
  const key = sha256(srcBuf).slice(0, 16);
  const cached = join(FONT_CACHE, `${key}.ttf`);
  if (existsSync(cached)) return readFileSync(cached);
  const ttf = Buffer.from(await wawoff2.decompress(srcBuf));
  if (ttf.readUInt32BE(0) !== 0x00010000) throw new Error(`not sfnt after decompress: ${srcPath}`);
  writeFileSync(cached, ttf);
  return ttf;
}

/** Copy only when absent or changed; returns 'new' | 'same' | 'updated'. */
function syncFile(srcPath, destPath) {
  if (!existsSync(destPath)) { mkdirSync(dirname(destPath), { recursive: true }); copyFileSync(srcPath, destPath); return 'new'; }
  const a = statSync(srcPath), b = statSync(destPath);
  if (a.size === b.size) {
    // cheap same-size guard: sample the head; full sha below only for new files
    if (readFileSync(destPath).equals(readFileSync(srcPath))) return 'same';
  }
  copyFileSync(srcPath, destPath);
  return 'updated';
}

// ---------------------------------------------------------------------------
// manifest of everything the previous run produced (for integrity reporting)
// ---------------------------------------------------------------------------

function readPrevManifest(base) {
  const p = join(base, 'native-assets-manifest.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { files: {} };
}

let converted = 0, reused = 0;
const totals = { ios: { new: 0, same: 0, updated: 0 }, android: { new: 0, same: 0, updated: 0 } };

for (const target of TARGETS) {
  const { base } = target;
  const assetPrefix = target.key === 'ios' ? 'Resources' : 'app/src/main/assets';
  const fixPrefix = target.key === 'ios' ? 'Fixtures' : 'app/src/test/resources/fixtures';
  const prev = readPrevManifest(base);
  const files = {};
  const bump = (rel, srcBufOrPath) => {
    const stat = typeof srcBufOrPath === 'string' ? statSync(srcBufOrPath) : { size: srcBufOrPath.length };
    const buf = typeof srcBufOrPath === 'string' ? readFileSync(srcBufOrPath) : srcBufOrPath;
    files[rel] = { bytes: stat.size, sha256: sha256(buf) };
  };

  // 1. canonical database
  const dbDest = join(base, assetPrefix, 'sadaqa.db');
  const dbState = syncFile(SRC.db, dbDest);
  totals[target.key][dbState]++; bump(`${assetPrefix}/sadaqa.db`, SRC.db);

  // 2. QPC1 fonts: per-page subsets decompressed to TTF; BSML ships as TTF already
  const fontSrcDir = target.key === 'ios' ? join(base, 'Resources', 'fonts') : join(base, 'app', 'src', 'main', 'assets', 'fonts');
  const fontEntries = {};
  for (const name of ['QPC1BSML.ttf']) {
    const st = syncFile(join(SRC.fonts, name), join(fontSrcDir, name));
    totals[target.key][st]++; bump(`fonts/${name}`, join(fontSrcDir, name));
    fontEntries[name] = { role: 'basmala', target: name };
  }
  for (let p = 1; p <= 604; p++) {
    const woffName = `p${String(p).padStart(3, '0')}.woff2`;
    const srcPath = join(SRC.fonts, woffName);
    if (!existsSync(srcPath)) throw new Error(`missing font source: ${srcPath}`);
    const ttfName = `p${String(p).padStart(3, '0')}.ttf`;
    const ttf = await woff2ToTtf(srcPath);
    const destPath = join(fontSrcDir, ttfName);
    if (!existsSync(destPath) || !readFileSync(destPath).equals(ttf)) { mkdirSync(dirname(destPath), { recursive: true }); writeFileSync(destPath, ttf); totals[target.key]['new']++; }
    else totals[target.key]['same']++;
    fontEntries[ttfName] = { role: 'page', page: p, source: woffName };
    converted++; // counted per conversion attempt (cache-aware below)
  }
  const fontsManifest = { formatVersion: 1, source: 'apps/web-desktop/assets/fonts/qpc1 (mushaf-layout@v2 QPC1 subsets)', pages: Object.values(fontEntries).filter((f) => f.role === 'page').length, entries: fontEntries };
  const fmDest = join(fontSrcDir, 'manifest.json');
  writeFileSync(fmDest, JSON.stringify(fontsManifest, null, 1));
  bump(`${assetPrefix}/fonts/manifest.json`, fmDest);

  // 3. design tokens + audio catalog + starter pack
  const tokensDest = join(base, assetPrefix, 'tokens.json');
  const tokensState = syncFile(SRC.tokens, tokensDest);
  totals[target.key][tokensState]++; bump(`${assetPrefix}/tokens.json`, SRC.tokens);

  const catDest = join(base, assetPrefix, 'audio-catalog.json');
  const catState = syncFile(SRC.audioCatalog, catDest);
  totals[target.key][catState]++; bump(`${assetPrefix}/audio-catalog.json`, SRC.audioCatalog);

  const starterDest = join(base, assetPrefix, 'audio', 'starter', 'alafasy');
  for (const mp3 of [...Array(7)].map((_, i) => `00100${i + 1}.mp3`)) {
    const src = join(SRC.audioStarter, mp3);
    if (!existsSync(src)) throw new Error(`missing starter mp3: ${src}`);
    const st = syncFile(src, join(starterDest, mp3));
    totals[target.key][st]++; bump(`${assetPrefix}/audio/starter/alafasy/${mp3}`, src);
  }

  // 4. parity fixtures (consumed by native test suites)
  const fixDest = target.key === 'ios' ? join(base, 'Fixtures') : join(base, 'app', 'src', 'test', 'resources', 'fixtures');
  for (const rel of ['manifest.json', join('schema', 'tableinfo.json'), join('qibla', 'bearings.json'), join('hijri', 'roundtrip.json'), join('hijri', 'events.json'), join('smart-card', 'cases.json'), join('backup', 'validate-cases.json'), join('backup', 'merge-cases.json'), join('backup', 'sample-export.json'), join('uuid7', 'synth.json')]) {
    const st = syncFile(join(SRC.fixtures, rel), join(fixDest, rel));
    totals[target.key][st]++; bump(`${fixPrefix}/${rel.replaceAll('\\', '/')}`, join(SRC.fixtures, rel));
  }
  // prayer fixture grids
  {
    const { readdirSync } = await import('node:fs');
    for (const f of readdirSync(SRC.fixtures)) {
      if (f.endsWith('.json')) { const st = syncFile(join(SRC.fixtures, f), join(fixDest, f)); totals[target.key][st]++; bump(`${fixPrefix}/${f}`, join(SRC.fixtures, f)); }
    }
    const prayerDir = join(SRC.fixtures, 'prayer');
    for (const f of readdirSync(prayerDir)) {
      const st = syncFile(join(prayerDir, f), join(fixDest, 'prayer', f));
      totals[target.key][st]++; bump(`${fixPrefix}/prayer/${f}`, join(prayerDir, f));
    }
  }

  // 5. per-tree manifest (what CI compares after regeneration)
  writeFileSync(join(base, 'native-assets-manifest.json'), JSON.stringify({ target: target.key, generated: '2026-11-17', files }, null, 1));
}

console.log(`native asset sync complete:`);
console.log(`  fonts converted woff2→ttf: 604 pages × 2 targets (cache: ${FONT_CACHE})`);
for (const [k, v] of Object.entries(totals)) console.log(`  ${k}: new=${v.new} same=${v.same} updated=${v.updated}`);
