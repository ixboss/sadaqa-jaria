#!/usr/bin/node
// fetch-seeds.mjs — download canonical seed datasets into packages/core-data/seed/
// Build-time ONLY (runtime stays 100% offline). Every URL is https with an
// SSRF-safe host check (public hosts only). Downloads land in seed/ with a
// provenance manifest (URL + sha256 + bytes + fetchedAt per artifact).
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import dns from 'node:dns/promises';

const SEED = join(dirname(fileURLToPath(import.meta.url)), '..', 'seed');
const MUSHAF_DIR = join(SEED, 'mushaf-qpc1');

// ---------------------------------------------------------------------------
// SSRF-safe fetch: https only; resolve every hostname and reject loopback,
// private, link-local, and reserved addresses; no redirects to other hosts.
// ---------------------------------------------------------------------------
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
  if (addrs.length === 0) throw new Error(`unresolvable host: ${host}`);
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
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const manifest = { generatedAt: new Date().toISOString(), artifacts: [] };
function record(name, source, buf) {
  manifest.artifacts.push({ name, source, bytes: buf.length, sha256: sha256(buf) });
  console.log(`  ${name}: ${buf.length} bytes (${sha256(buf).slice(0, 12)}…)`);
}

// ---------------------------------------------------------------------------
// Datasets (all pinned, provenance-recorded)
// ---------------------------------------------------------------------------
async function fetchQuranEdition(edition, outName) {
  console.log(`fetching quran edition ${edition}…`);
  const buf = await fetchBinary(`https://api.alquran.cloud/v1/quran/${edition}`);
  const data = JSON.parse(buf.toString('utf8'));
  if (data.code !== 200 || !data.data?.surahs) throw new Error(`${edition}: unexpected payload shape`);
  const surahs = data.data.surahs;
  if (surahs.length !== 114) throw new Error(`${edition}: expected 114 surahs`);
  writeFileSync(join(SEED, outName), buf);
  record(outName, `https://api.alquran.cloud/v1/quran/${edition}`, buf);
  return surahs.length;
}

async function fetchMushafLayout() {
  console.log('fetching mushaf QPC1 layout (604 pages)…');
  mkdirSync(MUSHAF_DIR, { recursive: true });
  let total = 0;
  for (let p = 1; p <= 604; p++) {
    const name = `page-${String(p).padStart(3, '0')}.json`;
    const out = join(MUSHAF_DIR, name);
    if (existsSync(out) && statSync(out).size > 0) { total += statSync(out).size; continue; }
    const buf = await fetchBinary(`https://raw.githubusercontent.com/zonetecde/mushaf-layout/v2/mushaf/QPC1/${name}`);
    writeFileSync(out, buf);
    total += buf.length;
    if (p % 100 === 0) console.log(`  …page ${p}/604`);
  }
  const all = listJson(MUSHAF_DIR);
  manifest.artifacts.push({ name: 'mushaf-qpc1/', source: 'https://github.com/zonetecde/mushaf-layout (branch v2, mushaf/QPC1)', bytes: total, files: all.length, sha256: sha256(Buffer.from(all.map((f) => `${f}:${sha256(readFileSync(join(MUSHAF_DIR, f)))}`).join('\n'))) });
  console.log(`  mushaf-qpc1: ${all.length} files, ${total} bytes`);
}

function listJson(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
}

async function fetchTafsirMuyassar() {
  console.log('fetching tafsir al-muyassar (ar)…');
  const buf = await fetchBinary('https://raw.githubusercontent.com/SAFI174/tafsir-json/main/json/ar.muyassar.json');
  const d = JSON.parse(buf.toString('utf8'));
  if (!Array.isArray(d.tafsir) || d.tafsir.length !== 114) throw new Error('muyassar: expected 114 surah arrays');
  writeFileSync(join(SEED, 'tafsir-ar.muyassar.json'), buf);
  record('tafsir-ar.muyassar.json', 'https://raw.githubusercontent.com/SAFI174/tafsir-json/main/json/ar.muyassar.json', buf);
}

async function fetchHisn() {
  console.log('fetching Hisn al-Muslim…');
  const buf = await fetchBinary('https://raw.githubusercontent.com/asellam/HisnElMuslim/main/hisn.json');
  const d = JSON.parse(buf.toString('utf8'));
  if (typeof d !== 'object' || Object.keys(d).length < 100) throw new Error(`hisn: expected >=100 categories, got ${Object.keys(d).length}`);
  writeFileSync(join(SEED, 'hisn.json'), buf);
  record('hisn.json', 'https://raw.githubusercontent.com/asellam/HisnElMuslim/main/hisn.json', buf);
}

async function fetchCities() {
  console.log('fetching offline cities (population ≥ 100k)…');
  const rows = [];
  let offset = 0;
  for (;;) {
    const url = `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/geonames-all-cities-with-a-population-1000/records?where=population%3E%3D100000&limit=100&offset=${offset}&select=geoname_id,name,cou_name_en,country_code,population,elevation,timezone,coordinates,alternate_names`;
    const buf = await fetchBinary(url);
    const d = JSON.parse(buf.toString('utf8'));
    rows.push(...d.results);
    if (d.results.length < 100 || rows.length >= d.total_count) break;
    offset += 100;
  }
  const buf = Buffer.from(JSON.stringify({ source: 'opendatasoft geonames-all-cities-with-a-population-1000', fetchedAt: manifest.generatedAt, rows }, null, 0));
  writeFileSync(join(SEED, 'cities.json'), buf);
  record('cities.json', 'https://public.opendatasoft.com/…/geonames-all-cities-with-a-population-1000 (population>=100000)', buf);
}

// ---------------------------------------------------------------------------
(async () => {
  mkdirSync(SEED, { recursive: true });
  await fetchQuranEdition('quran-uthmani', 'quran-uthmani.json');
  await fetchQuranEdition('quran-simple', 'quran-simple.json');
  await fetchMushafLayout();
  await fetchTafsirMuyassar();
  await fetchHisn();
  await fetchCities();
  const mPath = join(SEED, 'manifest.json');
  writeFileSync(mPath, JSON.stringify(manifest, null, 2));
  console.log(`seed manifest → ${mPath} (${manifest.artifacts.length} artifacts)`);
})().catch((e) => { console.error('FETCH FAILED:', e.message); process.exit(1); });
