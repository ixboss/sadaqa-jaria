#!/usr/bin/node
// fetch-fonts.mjs — download the QPC1 per-page subset fonts (604 woff2 + BSML)
// from the same source as the mushaf layout (zonetecde/mushaf-layout@v2) so
// codepoints and glyphs are guaranteed to match sadaqa.db.
// Resumable: existing files are skipped. Provenance → fonts manifest.
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import dns from 'node:dns/promises';

const DEST = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'web-desktop', 'assets', 'fonts', 'qpc1');
const UTHMANIC_DEST = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'web-desktop', 'assets', 'fonts', 'uthmanic');
const BASE = 'https://raw.githubusercontent.com/zonetecde/mushaf-layout/v2/fonts/QPC1/';
const UTHMANIC_BASE = 'https://raw.githubusercontent.com/quran/quran.com-frontend-next/master/public/fonts/quran/hafs/uthmanic_hafs/';

function assertPublicHttps(urlStr) {
  const u = new URL(urlStr);
  if (u.protocol !== 'https:') throw new Error(`refusing non-https URL: ${urlStr}`);
  return u;
}
async function assertResolvablePublicHost(u) {
  const host = u.hostname;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error(`refusing reserved host: ${host}`);
  }
  const addrs = await dns.lookup(host, { all: true });
  for (const { address } of addrs) {
    const fam = isIP(address);
    if (fam === 4) {
      const [a, b] = address.split('.').map(Number);
      const bad = a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
      if (bad) throw new Error(`refusing private/reserved address for ${host}: ${address}`);
    } else if (fam === 6) {
      const low = address.toLowerCase();
      if (low === '::1' || low.startsWith('fe80') || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('ff')) {
        throw new Error(`refusing private/reserved address for ${host}: ${address}`);
      }
    }
  }
}
async function fetchBinary(urlStr) {
  const u = assertPublicHttps(urlStr);
  await assertResolvablePublicHost(u);
  const res = await fetch(u, { redirect: 'error' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${urlStr}`);
  return Buffer.from(await res.arrayBuffer());
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

(async () => {
  mkdirSync(DEST, { recursive: true });
  const files = ['QPC1BSML.ttf', ...Array.from({ length: 604 }, (_, i) => `p${String(i + 1).padStart(3, '0')}.woff2`)];
  const manifest = { source: BASE, artifacts: [] };
  let fetched = 0, bytes = 0;
  for (const name of files) {
    const out = join(DEST, name);
    if (existsSync(out) && statSync(out).size > 0) {
      bytes += statSync(out).size;
      continue;
    }
    const buf = await fetchBinary(BASE + name);
    writeFileSync(out, buf);
    bytes += buf.length;
    fetched++;
    if (fetched % 100 === 0) console.log(`  …${fetched} fetched`);
  }
  // digest over all files in deterministic order (covers cached files too)
  for (const name of files) {
    const buf = readFileSync(join(DEST, name));
    manifest.artifacts.push({ name, bytes: buf.length, sha256: sha256(buf) });
  }
  writeFileSync(join(DEST, 'manifest.json'), JSON.stringify({ ...manifest, totalBytes: bytes }, null, 2));

  // Canonical KFGQPC Uthmanic Hafs fallback + verse/citation font (Web woff2 + Native ttf)
  mkdirSync(UTHMANIC_DEST, { recursive: true });
  for (const uName of ['UthmanicHafs1Ver18.woff2', 'UthmanicHafs1Ver18.ttf']) {
    const out = join(UTHMANIC_DEST, uName);
    if (!existsSync(out) || statSync(out).size === 0) {
      const buf = await fetchBinary(UTHMANIC_BASE + uName);
      writeFileSync(out, buf);
      fetched++;
    }
  }
  console.log(`OK: ${files.length} QPC1 + UthmanicHafs1Ver18 font files (${(bytes / 1024 / 1024).toFixed(1)} MB, fetched ${fetched} this run)`);
})().catch((e) => { console.error('FONT FETCH FAILED:', e.message); process.exit(1); });
