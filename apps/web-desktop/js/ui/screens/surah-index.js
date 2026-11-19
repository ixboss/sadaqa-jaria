// ============================================================================
// surah-index.js — 114-surah & 30-juz navigator (mushaf hub): jump to any
// surah or juz start page, plus bookmarks & Mushaf hub sub-navigation.
// ============================================================================
import { state } from '../../app-state.js';
import { navigate } from '../router.js';
import { iconSvg } from '../icons.js';

/** تهريب نصوص قد تأتي من استيراد نسخة احتياطية (label_ar للمستخدم) قبل قالب
 * innerHTML — تسمية bookmark تُكتب بحرية (audit 2026-11). */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function renderSurahIndex(root) {
  const [rows, juzRows, bookmarks] = await Promise.all([
    state.db.query(`SELECT number, name_ar, name_translit, ayah_count, start_page, revelation_type FROM surahs ORDER BY number`),
    state.db.query(`SELECT juz, MIN(page) AS start_page FROM ayahs GROUP BY juz ORDER BY juz`),
    state.db.query(`SELECT page, label_ar FROM bookmarks WHERE deleted = 0 ORDER BY updated_at DESC LIMIT 8`),
  ]);

  root.innerHTML = `
  <div class="screen">
    <div class="screen-header">
      <h1>المصحف الشريف</h1>
      <div class="sub">١١٤ سورة · ٣٠ جزءاً — انقر للانتقال الفوري</div>
    </div>
    <div style="padding:8px 16px 2px">
      <input class="search-input" id="surah-filter" type="search" placeholder="ابحث باسم السورة أو رقمها…" autocomplete="off">
    </div>
    <div class="juz-strip" aria-label="الأجزاء">
      ${juzRows.map((j) => `<button class="juz-pill" data-page="${j.start_page}">الجزء ${j.juz}</button>`).join('')}
    </div>
    ${bookmarks.length ? `
      <div style="padding:4px 16px 6px;display:flex;gap:6px;flex-wrap:wrap">
        ${bookmarks.map((b) => `<button class="juz-pill" data-page="${b.page}" style="border-color:var(--color-accent);color:var(--color-accent)">${iconSvg('bookmark-filled', 13)}<span>${escapeHtml(b.label_ar) || `ص ${b.page}`}</span></button>`).join('')}
      </div>` : ''}
    <div id="surah-list">${rows.map((s) => `
      <div class="cat-tile" data-page="${s.start_page}" data-search="${s.number} ${s.name_ar} ${s.name_translit}" role="button" tabindex="0" aria-label="${s.name_ar}">
        <span class="c-icon" style="min-width:34px;text-align:center;font-variant-numeric:tabular-nums;color:var(--color-accent);font-weight:700">${s.number}</span>
        <span class="c-name">${s.name_ar} <span style="font-size:12px;color:var(--color-text-secondary)">${(s.revelation_type === 'makkah' || s.revelation_type === 'Meccan') ? 'مكية' : 'مدنية'} · ${s.ayah_count} آية</span></span>
        <span class="c-meta">ص ${s.start_page}</span>
      </div>`).join('')}</div>
  </div>`;

  for (const btn of root.querySelectorAll('[data-go]')) {
    btn.addEventListener('click', () => navigate(btn.dataset.go));
  }
  const open = (p) => navigate('mushaf-page', { page: Number(p) });
  for (const el of root.querySelectorAll('[data-page]')) {
    el.addEventListener('click', () => open(el.dataset.page));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(el.dataset.page); } });
  }
  const filter = root.querySelector('#surah-filter');
  filter?.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    for (const tile of root.querySelectorAll('#surah-list .cat-tile')) {
      tile.style.display = (!q || tile.dataset.search.toLowerCase().includes(q)) ? '' : 'none';
    }
  });
}
