// ============================================================================
// search.js — universal offline search sheet: diacritic-insensitive FTS over
// 6,236 ayahs + athkar + surah names (ftsQuery() applies the same normalizer
// used at ingestion — REA_SPEC §4.4 contract).
// ============================================================================
import { state } from '../../app-state.js';
import { ftsQuery, normalizeArabic } from '../../../../../packages/core-data/engines/search.js';
import { gotoAyah } from './mushaf.js';
import { navigate } from '../router.js';
import { iconSvg } from '../icons.js';

export function renderSearchSheet() {
  const host = document.getElementById('sheet-root');
  host.innerHTML = `
  <div class="sheet-backdrop" id="sh-backdrop"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="بحث شامل">
    <div class="sheet-handle"></div>
    <div class="sheet-head"><h2>بحث شامل</h2><button class="sheet-close" id="sh-close" aria-label="إغلاق">${iconSvg('close', 18)}</button></div>
    <div class="sheet-body">
      <input class="search-input" id="search-input" type="search" enterkeyhint="search" placeholder="ابحث في القرآن والأذكار والسور" autocomplete="off">
      <div id="search-results" aria-live="polite"><div class="empty-state"><div class="icon">${iconSvg('search', 22)}</div><h2>بحث دون اتصال</h2><p>اكتب كلمة من الآية أو الذكر أو اسم السورة حتى بدون تشكيل.</p></div></div>
    </div>
  </div>`;
  wire(host);
}

function closeSheet(host) {
  host.querySelector('.sheet')?.classList.add('closing');
  host.querySelector('.sheet-backdrop')?.classList.add('closing');
  setTimeout(() => { host.innerHTML = ''; }, 240);
}

function wire(host) {
  const close = () => closeSheet(host);
  host.querySelector('#sh-close').addEventListener('click', close);
  host.querySelector('#sh-backdrop').addEventListener('click', close);
  const input = host.querySelector('#search-input');
  input.focus();
  let seq = 0;
  input.addEventListener('input', async () => {
    const mySeq = ++seq;
    const raw = input.value.trim();
    const out = host.querySelector('#search-results');
    if (raw.length < 2) { out.innerHTML = ''; return; }
    const q = ftsQuery(raw);
    if (!q) { out.innerHTML = ''; return; }
    // surah-name results (normalized scan over 114 rows — cheap, in JS)
    const nq = normalizeArabic(raw);
    const surahRows = await state.db.query(`SELECT number, name_ar, name_translit, start_page FROM surahs`);
    const surahHits = surahRows.filter((s) => normalizeArabic(s.name_ar).includes(nq) || s.name_translit.toLowerCase().startsWith(raw.toLowerCase())).slice(0, 4);
    const [ayahRows, athkarRows] = await Promise.all([
      state.db.query(`SELECT f.rowid AS ayah_number, a.surah, a.number_in_surah, a.text_uthmani, s.name_ar AS surah_name
        FROM (SELECT rowid FROM fts_ayahs WHERE fts_ayahs MATCH ? ORDER BY rowid LIMIT 20) f
        JOIN ayahs a ON a.ayah_number = f.rowid JOIN surahs s ON s.number = a.surah`, [q]),
      state.db.query(`SELECT f.rowid AS item_rowid, i.item_id, i.text_ar, c.name_ar AS cat_name
        FROM (SELECT rowid FROM fts_athkar WHERE fts_athkar MATCH ? LIMIT 8) f
        JOIN athkar_items i ON i.rowid = f.rowid JOIN athkar_categories c ON c.category_id = i.category_id`, [q]),
    ]);
    if (mySeq !== seq) return; // stale keystroke
    out.innerHTML = `
      ${surahHits.length ? `<div class="result-group"><h3>السور</h3>${surahHits.map((s) => `
        <div class="result-item" data-surah="${s.number}" data-surah-page="${s.start_page ?? 1}"><div class="ayah-text">${escapeHtml(s.name_ar)}</div><div class="meta">سورة ${s.number} · تبدأ في صفحة ${s.start_page ?? '…'}</div></div>`).join('')}</div>` : ''}
      ${ayahRows.length ? `<div class="result-group"><h3>الآيات</h3>${ayahRows.map((r) => `
        <div class="result-item" data-ayah="${r.ayah_number}"><div class="ayah-text">${escapeHtml(r.text_uthmani)}</div><div class="meta">${escapeHtml(r.surah_name)} · الآية ${r.number_in_surah}</div></div>`).join('')}</div>` : ''}
      ${athkarRows.length ? `<div class="result-group"><h3>الأذكار</h3>${athkarRows.map((r) => `
        <div class="result-item"><div class="ayah-text" style="font-size:16px">${escapeHtml(r.text_ar)}</div><div class="meta">${escapeHtml(r.cat_name)}</div></div>`).join('')}</div>` : ''}
      ${!surahHits.length && !ayahRows.length && !athkarRows.length ? `<div class="empty-state"><div class="icon">${iconSvg('search', 20)}</div><h2>لا نتائج</h2><p>جرّب كلمات أقل أو بدون تشكيل.</p></div>` : ''}`;
    for (const el of out.querySelectorAll('[data-surah-page]')) {
      el.addEventListener('click', () => { close(); navigate('mushaf-page', { page: Number(el.dataset.surahPage) }); });
    }
    for (const el of out.querySelectorAll('[data-ayah]')) {
      el.addEventListener('click', () => { close(); gotoAyah(Number(el.dataset.ayah)); });
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
