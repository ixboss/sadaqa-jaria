#!/usr/bin/node
// vendor-sqlite-wasm.mjs — download the pinned @sqlite.org/sqlite-wasm build and
// copy dist/index.mjs + dist/sqlite3.wasm into apps/web-desktop/vendor/sqlite-wasm/.
// Security: https + public-host resolution check; sha256 recorded in vendor.json.
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import dns from 'node:dns/promises';

const VERSION = '3.54.1-build1';
const TARBALL = `https://registry.npmjs.org/@sqlite.org/sqlite-wasm/-/sqlite-wasm-${VERSION}.tgz`;
const DEST = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'web-desktop', 'vendor', 'sqlite-wasm');
const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages', 'core-data', 'build', 'tmp-sqlite-wasm');

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
      if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) {
        throw new Error(`refusing private/reserved address for ${host}: ${address}`);
      }
    } else if (fam === 6) {
      const low = address.toLowerCase();
      if (low === '::1' || low.startsWith('fe80') || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('ff')) {
        throw new Error(`refusing private/reserved address for ${host}: ${address}`);
      }
    }
  }
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

(async () => {
  const u = assertPublicHttps(TARBALL);
  await assertResolvablePublicHost(u);
  console.log(`downloading ${TARBALL}…`);
  const res = await fetch(u, { redirect: 'error' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const tgz = Buffer.from(await res.arrayBuffer());

  // extract the two needed artifacts from the tarball in memory (gunzip + untar)
  const { gunzipSync } = await import('node:zlib');
  const unzipped = gunzipSync(tgz);
  const files = {};
  // minimal ustar parse: 512-byte headers
  let off = 0;
  while (off + 512 <= unzipped.length) {
    const header = unzipped.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const sizeStr = header.subarray(124, 136).toString('utf8').replace(/[\0 ]*$/, '');
    const size = parseInt(sizeStr, 8) || 0;
    const typeFlag = header[156];
    off += 512;
    const data = unzipped.subarray(off, off + size);
    off += Math.ceil(size / 512) * 512;
    if (typeFlag === 0 || typeFlag === 48) files[name] = data;
  }
  const wanted = { 'package/dist/index.mjs': 'index.mjs', 'package/dist/sqlite3.wasm': 'sqlite3.wasm' };
  const out = {};
  for (const [src, dst] of Object.entries(wanted)) {
    if (!files[src]) throw new Error(`missing ${src} in tarball (have: ${Object.keys(files).slice(0, 20).join(', ')}…)`);
    out[dst] = files[src];
  }

  mkdirSync(DEST, { recursive: true });
  for (const [dst, buf] of Object.entries(out)) {
    writeFileSync(join(DEST, dst), buf);
    console.log(`  ${dst}: ${buf.length} bytes (sha256 ${sha256(buf).slice(0, 16)}…)`);
  }
  rmSync(TMP, { force: true, recursive: true });
  writeFileSync(join(DEST, 'vendor.json'), JSON.stringify({
    name: '@sqlite.org/sqlite-wasm',
    version: VERSION,
    source: TARBALL,
    artifacts: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { bytes: v.length, sha256: sha256(v) }])),
    license: ' blessing / Public Domain (SQLite)',
    note: 'Vendored, pinned. Do not hand-edit; re-run scripts/tools/vendor-sqlite-wasm.mjs to refresh.',
  }, null, 2));
  console.log(`OK → ${DEST}`);
})().catch((e) => { console.error('VENDOR FAILED:', e.message); process.exit(1); });
