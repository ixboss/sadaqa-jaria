// ============================================================================
// ayah-sheet.js — long-press/tap ayah action sheet (REA_SPEC A-4):
// Tafsir (Muyassar) · Mutashabihat · Bookmark · Share · Play-from-here.
// ============================================================================
import { state, haptic, HAPTICS } from '../../app-state.js';
import { iconSvg } from '../icons.js';

export function renderAyahSheet(ayahNumber) {
  const host = document.getElementById('sheet-root');
  host.innerHTML = `
  <div class="sheet-backdrop" id="sh-backdrop"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="خيارات الآية">
    <div class="sheet-handle"></div>
    <div class="sheet-head"><h2 id="ay-title">…</h2><button class="sheet-close" id="sh-close" aria-label="إغلاق">${iconSvg('close', 18)}</button></div>
    <div class="sheet-body">
      <div class="ayah-body" id="ay-body">…</div>
      <div class="sheet-actions">
        <button class="btn primary" id="ay-tafsir">التفسير</button>
        <button class="btn" id="ay-mutashabihat">آيات مشابهة</button>
        <button class="btn" id="ay-bookmark">حفظ علامة</button>
        <button class="btn" id="ay-copy">نسخ</button>
        <button class="btn" id="ay-share">مشاركة</button>
        <button class="btn" id="ay-play">${iconSvg('play', 14)}<span>تشغيل من هنا</span></button>
      </div>
      <div id="ay-extra"></div>
    </div>
  </div>`;

  const close = () => {
    host.querySelector('.sheet')?.classList.add('closing');
    host.querySelector('.sheet-backdrop')?.classList.add('closing');
    setTimeout(() => { host.innerHTML = ''; }, 240);
  };
  host.querySelector('#sh-close').addEventListener('click', close);
  host.querySelector('#sh-backdrop').addEventListener('click', close);

  (async () => {
    if (!Number.isInteger(ayahNumber) || ayahNumber < 1) { close(); return; }
    const ayah = await state.db.queryOne(`SELECT ayah_number, surah, number_in_surah, text_uthmani, text_imlaei FROM ayahs WHERE ayah_number = ?`, [ayahNumber]);
    if (!ayah) { close(); return; }
    const surah = await state.db.queryOne(`SELECT name_ar FROM surahs WHERE number = ?`, [ayah.surah]);
    if (!surah) { close(); return; }
    host.querySelector('#ay-title').textContent = `${surah.name_ar} · الآية ${ayah.number_in_surah}`;
    host.querySelector('#ay-body').textContent = ayah.text_uthmani;

    host.querySelector('#ay-tafsir').addEventListener('click', async () => {
      const t = await state.db.queryOne(`SELECT body FROM tafsirs WHERE book_id = 'muyassar' AND ayah_number = ?`, [ayahNumber]);
      // نص فارغ/فراغات فقط (بطاقة آية ٢٨:٣٤ في المصدر) → حالة «غير متوفر»
      // صريحة بدل بطاقة بيضاء فارغة — لا يُخترع نص بديل (audit 2026-11)
      const body = (typeof t?.body === 'string' && t.body.trim().length > 0) ? t.body : 'غير متوفر في هذه النسخة.';
      host.querySelector('#ay-extra').innerHTML = `<h3 style="font-size:14px;color:var(--color-text-secondary)">التفسير الميسر</h3>
        <div class="tafsir-body">${escapeHtml(body)}</div>`;
    });
    host.querySelector('#ay-mutashabihat').addEventListener('click', async () => {
      const rows = await state.db.query(`SELECT m.similar_ayah, m.note_ar, a.text_uthmani, a.surah, a.number_in_surah
        FROM mutashabihat m JOIN ayahs a ON a.ayah_number = m.similar_ayah WHERE m.ayah_number = ?`, [ayahNumber]);
      host.querySelector('#ay-extra').innerHTML = rows.length
        ? `<h3 style="font-size:14px;color:var(--color-text-secondary)">آيات مشابهة</h3>${rows.map((r) => `<div class="tafsir-body" style="margin:8px 0">${escapeHtml(r.text_uthmani)}</div><div style="font-size:12px;color:var(--color-text-secondary)">${escapeHtml(r.note_ar ?? '')}</div>`).join('')}`
        : `<div class="empty-state" style="padding:20px"><h2>لا بيانات مسجلة</h2><p>حزمة المتشابهات تُضاف مع حزم البيانات الاختيارية.</p></div>`;
    });
    host.querySelector('#ay-bookmark').addEventListener('click', async (e) => {
      const pageRow = await state.db.queryOne(`SELECT page FROM ayahs WHERE ayah_number = ?`, [ayahNumber]);
      await state.db.write(`INSERT INTO bookmarks (uuid, page, ayah_number, label_ar, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`, [crypto.randomUUID(), pageRow.page, ayahNumber, `${surah.name_ar} ${ayah.number_in_surah}`, Date.now(), Date.now()]);
      haptic(HAPTICS.bookmarkSaved);
      e.target.textContent = 'تم الحفظ';
      e.target.disabled = true;
    });
    host.querySelector('#ay-copy')?.addEventListener('click', async () => {
      const text = `${ayah.text_uthmani}\n— ${surah.name_ar} · الآية ${ayah.number_in_surah}`;
      await navigator.clipboard.writeText(text);
      host.querySelector('#ay-copy').textContent = 'تم النسخ';
    });
    host.querySelector('#ay-share').addEventListener('click', async () => {
      const text = `${ayah.text_uthmani}\n— ${surah.name_ar} · الآية ${ayah.number_in_surah}`;
      if (navigator.share) {
        try { await navigator.share({ text }); } catch { /* user cancelled */ }
      } else {
        await navigator.clipboard.writeText(text);
        host.querySelector('#ay-share').textContent = 'تم النسخ';
      }
    });
    host.querySelector('#ay-play').addEventListener('click', async () => {
      const { startPlayback } = await import('./audio.js');
      close();
      startPlayback(ayah.surah, ayah.number_in_surah);
    });
  })().catch((e) => { console.error('[ayah-sheet]', e); });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
