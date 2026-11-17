// ============================================================================
// surah-index.js — 114-surah navigator (mushaf tab): jump to any surah's
// start page. Data straight from the canonical surahs table.
// ============================================================================
import { state } from '../../app-state.js';
import { navigate } from '../router.js';

export async function renderSurahIndex(root) {
  const rows = await state.db.query(`SELECT number, name_ar, name_translit, ayah_count, start_page, revelation_type FROM surahs ORDER BY number`);
  root.innerHTML = `
  <div class="screen">
    <div class="screen-header"><h1>السور</h1><div class="sub">١١٤ سورة — انقر للانتقال إلى صفحة بدايتها</div></div>
    <div id="surah-list">${rows.map((s) => `
      <div class="cat-tile" data-page="${s.start_page}" role="button" tabindex="0" aria-label="${s.name_ar}">
        <span class="c-icon" style="min-width:34px;text-align:center;font-variant-numeric:tabular-nums;color:var(--color-text-secondary)">${s.number}</span>
        <span class="c-name">${s.name_ar} <span style="font-size:11px;color:var(--color-text-secondary)">${s.name_translit} · ${s.ayah_count} آية</span></span>
        <span class="c-meta">ص ${s.start_page}</span>
      </div>`).join('')}</div>
  </div>`;
  const open = (p) => navigate('mushaf-page', { page: Number(p) });
  for (const el of root.querySelectorAll('[data-page]')) {
    el.addEventListener('click', () => open(el.dataset.page));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(el.dataset.page); } });
  }
}
