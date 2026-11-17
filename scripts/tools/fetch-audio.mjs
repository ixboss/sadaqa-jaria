// ============================================================================
// fetch-audio.mjs — Phase 4: real reciter audio catalog + starter pack.
// Build-time network step ONLY (the app itself is 100% offline afterwards):
//   1. Probe candidate EveryAyah reciter folders with a ranged GET — only
//      folders that actually serve audio become catalog entries (real, not
//      fabricated).
//   2. Download the starter pack: Al-Fatiha (7 ayahs) by Alafasy — ships in
//      the bundle so the player works offline out of the box.
// Output:
//   apps/web-desktop/assets/audio/catalog.json
//   apps/web-desktop/assets/audio/starter/alafasy/00100{1..7}.mp3
// SSRF posture: single allowlisted https host (everyayah.com), no redirects
// followed, no user-controlled URL parts.
// ============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'apps', 'web-desktop', 'assets', 'audio');
const STARTER_DIR = join(OUT_DIR, 'starter', 'alafasy');

const HOST = 'everyayah.com'; // allowlisted — the ONLY host this script talks to
const urlFor = (folder, surah, ayah) =>
  `https://${HOST}/data/${encodeURIComponent(folder)}/${String(surah).padStart(3, '0')}${String(ayah).padStart(3, '0')}.mp3`;

/** Candidate catalog — folder names must be verified live before shipping. */
const CANDIDATES = [
  { folder: 'Alafasy_128kbps', reciter_id: 'alafasy', name_ar: 'مشاري راشد العفاسي', name_en: 'Mishary Rashid Alafasy', style: 'murattal', bitrate_kbps: 128 },
  { folder: 'Abdul_Basit_Murattal_192kbps', reciter_id: 'abdulbasit_murattal', name_ar: 'عبد الباسط عبد الصمد (مرتل)', name_en: 'Abdul Basit Abdus Samad (Murattal)', style: 'murattal', bitrate_kbps: 192 },
  { folder: 'Abdul_Basit_Mujawwad_128kbps', reciter_id: 'abdulbasit_mujawwad', name_ar: 'عبد الباسط عبد الصمد (مجود)', name_en: 'Abdul Basit Abdus Samad (Mujawwad)', style: 'mujawwad', bitrate_kbps: 128 },
  { folder: 'Husary_128kbps', reciter_id: 'husary', name_ar: 'محمود خليل الحصري (مرتل)', name_en: 'Mahmoud Khalil Al-Husary (Murattal)', style: 'murattal', bitrate_kbps: 128 },
  { folder: 'Husary_Mujawwad_64kbps', reciter_id: 'husary_mujawwad', name_ar: 'محمود خليل الحصري (مجود)', name_en: 'Mahmoud Khalil Al-Husary (Mujawwad)', style: 'mujawwad', bitrate_kbps: 64 },
  { folder: 'Minshawy_Murattal_128kbps', reciter_id: 'minshawi_murattal', name_ar: 'محمد صديق المنشاوي (مرتل)', name_en: 'Mohamed Siddiq Al-Minshawi (Murattal)', style: 'murattal', bitrate_kbps: 128 },
  { folder: 'Minshawy_Mujawwad_192kbps', reciter_id: 'minshawi_mujawwad', name_ar: 'محمد صديق المنشاوي (مجود)', name_en: 'Mohamed Siddiq Al-Minshawi (Mujawwad)', style: 'mujawwad', bitrate_kbps: 192 },
  { folder: 'Mahir_AlMuaiqly_128kbps', reciter_id: 'muaiqly', name_ar: 'ماهر المعيقلي', name_en: 'Maher Al Muaiqly', style: 'murattal', bitrate_kbps: 128 },
  { folder: 'Abu_Bakr_Ash-Shaatree_128kbps', reciter_id: 'shaatree', name_ar: 'أبو بكر الشاطري', name_en: 'Abu Bakr Ash-Shaatree', style: 'murattal', bitrate_kbps: 128 },
  { folder: 'Abdullah_Basfar_192kbps', reciter_id: 'basfar', name_ar: 'عبد الله بصفر', name_en: 'Abdullah Basfar', style: 'murattal', bitrate_kbps: 192 },
  { folder: 'Abdullaah_3awwaad_Al-Juhaynee_128kbps', reciter_id: 'juhaynee', name_ar: 'عبد الله عواد الجهني', name_en: 'Abdullah Awad Al-Juhany', style: 'murattal', bitrate_kbps: 128 },
  { folder: 'Ahmed_ibn_Ali_al-Ajamy_128kbps', reciter_id: 'ajamy', name_ar: 'أحمد بن علي العجمي', name_en: 'Ahmed ibn Ali Al-Ajamy', style: 'murattal', bitrate_kbps: 128 },
  { folder: 'Fares_Abbad_64kbps', reciter_id: 'fares', name_ar: 'فارس عباد', name_en: 'Fares Abbad', style: 'murattal', bitrate_kbps: 64 },
  { folder: 'Yasser_Ad-Dussary_128kbps', reciter_id: 'dussary', name_ar: 'ياسر الدوسري', name_en: 'Yasser Al-Dossary', style: 'murattal', bitrate_kbps: 128 },
  { folder: 'Ghamadi_40kbps', reciter_id: 'ghamadi', name_ar: 'سعد الغامدي', name_en: 'Saad Al-Ghamdi', style: 'murattal', bitrate_kbps: 40 },
  { folder: 'Hudhaify_128kbps', reciter_id: 'hudhaify', name_ar: 'علي بن عبد الرحمن الحذيفي', name_en: 'Ali Al-Hudhaify', style: 'murattal', bitrate_kbps: 128 },
  { folder: 'Nasser_Alqatami_128kbps', reciter_id: 'alqatami', name_ar: 'ناصر القطامي', name_en: 'Nasser Al-Qatami', style: 'murattal', bitrate_kbps: 128 },
  { folder: 'Ali_Jaber_64kbps', reciter_id: 'ali_jaber', name_ar: 'علي جابر (مجود)', name_en: 'Ali Jaber (Mujawwad)', style: 'mujawwad', bitrate_kbps: 64 },
  { folder: 'Muhammad_Ayyoub_128kbps', reciter_id: 'ayyoub', name_ar: 'محمد أيوب', name_en: 'Muhammad Ayyoub', style: 'murattal', bitrate_kbps: 128 },
  { folder: 'Ibrahim_Akhdar_32kbps', reciter_id: 'akhdar', name_ar: 'إبراهيم الأخضر', name_en: 'Ibrahim Al-Akhdar', style: 'murattal', bitrate_kbps: 32 },
];

async function fetchRanged(url) {
  // SSRF posture: scheme https, host pinned by construction, redirects refused.
  const res = await fetch(url, { headers: { Range: 'bytes=0-2047' }, redirect: 'error' });
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength < 64) throw new Error('suspiciously small body');
  // EveryAyah returns text/html error pages with 200 on some bad folders — sniff for mp3
  const head = new Uint8Array(buf.slice(0, 4));
  const isMp3 = (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
  if (!isMp3) throw new Error('body is not an mp3 stream');
  return buf;
}

const verified = [];
for (const c of CANDIDATES) {
  const url = urlFor(c.folder, 1, 1);
  try {
    await fetchRanged(url);
    verified.push(c);
    console.log(`✔ ${c.reciter_id} (${c.folder})`);
  } catch (e) {
    console.log(`✘ ${c.reciter_id} (${c.folder}) — ${e.message}`);
  }
}
if (verified.length < 5) throw new Error(`catalog verification failed — only ${verified.length} reciters reachable`);

const manifest = {
  format: 'sadaqa-audio-catalog',
  formatVersion: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  source: { name: 'EveryAyah', url: `https://${HOST}`, license: 'free public recitation distribution' },
  starterPack: {
    reciter_id: 'alafasy',
    scope: 'surah_subset',
    surahs: [1],
    ayahs: 7,
    basePrefix: 'assets/audio/starter/alafasy',
    fileTemplate: 'SSSAAA.mp3',
  },
  reciters: verified.map((c) => ({
    ...c,
    word_segments_available: 0, // EveryAyah ships per-ayah files only → ayah-level highlight
    audio_url_template: `https://${HOST}/data/${c.folder}/{SSSAAA}.mp3`,
  })),
};
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'catalog.json'), JSON.stringify(manifest, null, 1));
console.log(`\ncatalog.json: ${verified.length} reciters`);

// Starter pack — real offline files (Al-Fatiha by Alafasy)
mkdirSync(STARTER_DIR, { recursive: true });
for (let a = 1; a <= 7; a++) {
  const name = `001${String(a).padStart(3, '0')}.mp3`;
  const url = urlFor('Alafasy_128kbps', 1, a);
  const res = await fetch(url, { redirect: 'error' });
  if (!res.ok) throw new Error(`starter ayah ${a}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(STARTER_DIR, name), buf);
  console.log(`⬇ starter ${name} — ${(buf.length / 1024).toFixed(0)} KB`);
}
console.log('done.');
