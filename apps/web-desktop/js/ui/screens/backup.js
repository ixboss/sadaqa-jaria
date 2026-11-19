// ============================================================================
// backup.js — `.sadaqa` Backup/Restore UI (Phase 4). Export with live counts,
// import flow: pick file → peek + validate (refusal with reasons) → mode sheet
// (Smart Merge / Full Replace with explicit warnings) → atomic apply → report.
// ============================================================================
import { state, loadState, haptic, HAPTICS } from '../../app-state.js';
import { exportBackup, importBackup, peekBackup } from '../../data/backup.js';
import { navigate } from '../router.js';
import { mountTheme } from '../../main.js';
import { iconSvg } from '../icons.js';

export async function renderBackup(root) {
  const counts = {
    bookmarks: (await state.db.queryOne(`SELECT COUNT(*) n FROM bookmarks WHERE deleted = 0`))?.n ?? 0,
    highlights: (await state.db.queryOne(`SELECT COUNT(*) n FROM highlights WHERE deleted = 0`))?.n ?? 0,
    notes: (await state.db.queryOne(`SELECT COUNT(*) n FROM notes WHERE deleted = 0`))?.n ?? 0,
    khatmah: (await state.db.queryOne(`SELECT COUNT(*) n FROM khatmah_plans WHERE deleted = 0`))?.n ?? 0,
    adhkar: (await state.db.queryOne(`SELECT COUNT(*) n FROM adhkar_state`))?.n ?? 0,
    tasbih: (await state.db.queryOne(`SELECT COUNT(*) n FROM tasbih_counters WHERE deleted = 0`))?.n ?? 0,
    sessions: (await state.db.queryOne(`SELECT COUNT(*) n FROM tasbih_sessions`))?.n ?? 0,
    streaks: (await state.db.queryOne(`SELECT COUNT(*) n FROM streak_days`))?.n ?? 0,
    settings: (await state.db.queryOne(`SELECT COUNT(*) n FROM user_settings WHERE key != 'device_id'`))?.n ?? 0,
  };
  const logs = await state.db.query(`SELECT * FROM backup_log ORDER BY created_at DESC LIMIT 5`);

  root.innerHTML = `
  <div class="screen">
    <div class="screen-header"><h1>النسخ الاحتياطي</h1><div class="sub">ملف .sadaqa محمول — يعمل عبر الويب وسطح المكتب والجوال</div></div>

    <div class="card">
      <h3 style="margin:0 0 8px;font-size:15px">بياناتك الحالية</h3>
      <div class="backup-counts">
        <div class="bc"><b>${counts.bookmarks}</b>فواصل</div>
        <div class="bc"><b>${counts.highlights}</b>تظليلات</div>
        <div class="bc"><b>${counts.notes}</b>ملاحظات</div>
        <div class="bc"><b>${counts.khatmah}</b>خطط ختمة</div>
        <div class="bc"><b>${counts.adhkar}</b>حالات أذكار</div>
        <div class="bc"><b>${counts.tasbih}</b>أوراد سبحة</div>
        <div class="bc"><b>${counts.sessions}</b>تسجيلات سبحة</div>
        <div class="bc"><b>${counts.streaks}</b>أيام سلاسل</div>
      </div>
      <button class="btn primary" id="bk-export" style="width:100%">تصدير ملف .sadaqa</button>
    </div>

    <div class="card">
      <h3 style="margin:0 0 8px;font-size:15px">استعادة من ملف</h3>
      <div class="mode-note">الملف يُفحص بالكامل قبل أي كتابة: ملف تالف أو أحدث إصداراً من التطبيق يُرفض ولا يُلمس شيء.</div>
      <div class="row-actions">
        <button class="btn primary" id="bk-import">اختيار ملف .sadaqa</button>
      </div>
      <div id="bk-peek" hidden></div>
    </div>

    <div class="card">
      <h3 style="margin:0 0 8px;font-size:15px">آخر العمليات</h3>
      ${logs.length === 0 ? '<div class="mode-note">لا عمليات بعد.</div>' : logs.map((l) => `
        <div class="plan-row" style="padding:7px 0;border-bottom:1px solid var(--color-border)">
          <span>${l.direction === 'export' ? 'تصدير' : `استيراد (${l.mode === 'merge' ? 'دمج ذكي' : 'استبدال كامل'})`}</span>
          <span style="font-size:12px;color:var(--color-text-secondary);font-variant-numeric:tabular-nums">${new Date(l.created_at).toLocaleString('ar')}</span>
        </div>`).join('')}
    </div>

    <div class="card">
      <div class="mode-note">ترحيل v1: يتم تلقائياً مرة واحدة عند أول تشغيل (السمة، حجم الخط، عدّاد السبحة). ختمة v1 القديمة لا تُرحَّل آلياً — أعد إنشاءها من شاشة الختمة.</div>
    </div>
  </div>`;

  root.querySelector('#bk-export').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'جاري التصدير…';
    try {
      const res = await exportBackup(state.db, state.bridge);
      haptic(HAPTICS.bookmarkSaved);
      btn.textContent = res.savedToPath ? `حُفظ: ${res.name}` : `نُزّل: ${res.name}`;
      // refresh the counts/history — but never stomp a navigation the user
      // already made within the feedback window (delayed-navigation race)
      setTimeout(() => {
        if (location.hash.startsWith('#/tools-backup')) navigate('tools-backup', { r: Date.now() });
      }, 900);
    } catch (err) {
      btn.textContent = 'تعذر التصدير';
      alert('فشل التصدير: ' + err.message);
      btn.disabled = false;
    }
  });

  root.querySelector('#bk-import').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const bytes = await state.bridge.importFile('.sadaqa');
      btn.disabled = false;
      if (!bytes) return;
      const peek = await peekBackup(bytes);
      renderPeek(peek, bytes);
    } catch (err) {
      btn.disabled = false;
      renderPeek({ ok: false, errors: [err.message] }, null);
    }
  });

  function renderPeek(peek, bytes) {
    const box = root.querySelector('#bk-peek');
    box.hidden = false;
    if (!peek.ok) {
      box.innerHTML = `<div class="empty-state" style="padding:18px"><div class="icon">${iconSvg('alert', 22)}</div>
        <h2>الملف مرفوض</h2><p class="bk-err-msg"></p></div>`;
      box.querySelector('.bk-err-msg').textContent = (peek.errors ?? []).slice(0, 3).join(' · ') || 'بنية غير صالحة';
      return;
    }
    const total = Object.values(peek.counts).reduce((a, b) => a + b, 0);
    box.innerHTML = `
      <div class="calc-out" style="margin-top:12px">
        <div class="mode-note">الملف سليم — ${total} عنصراً (${Object.entries(peek.counts).map(([g, n]) => `${n} ${gName(g)}`).join('، ')}) — أُنشئ ${new Date(peek.manifest.createdAt).toLocaleDateString('ar')}</div>
        <div class="row-actions">
          <button class="btn primary" id="bk-merge">دمج ذكي</button>
          <button class="btn text-danger" id="bk-replace">استبدال كامل</button>
        </div>
        <div class="mode-note"><b>الدمج الذكي</b> يضيف الجديد ويحدّث الأحدث زمنياً ويحفظ الحذف — لا يفقد شيئاً.<br>
        <b>الاستبدال الكامل</b> يمسح بياناتك المحلية كلها ثم يضع محتوى الملف — تأكد قبل المتابعة.</div>
      </div>`;
    box.querySelector('#bk-merge').addEventListener('click', () => runImport(bytes, 'merge'));
    box.querySelector('#bk-replace').addEventListener('click', () => {
      if (confirm('الاستبدال الكامل سيمسح كل بياناتك المحلية (فواصل، ملاحظات، أوراد، سلاسل، إعدادات) ويضع محتوى الملف. متابعة؟')) runImport(bytes, 'replace');
    });
  }

  const gName = (g) => ({ reading: 'قراءة', dhikr: 'أذكار', prefs: 'إعدادات', meta: 'سلاسل' }[g] ?? g);

  async function runImport(bytes, mode) {
    try {
      const res = await importBackup(state.db, bytes, mode);
      haptic(res.report.conflicts > 0 ? HAPTICS.dhikrComplete : HAPTICS.categoryComplete);
      const box = root.querySelector('#bk-peek');
      box.innerHTML = `
        <div class="calc-out" style="margin-top:12px">
          <h3 style="margin:0 0 8px;font-size:15px">${mode === 'merge' ? 'تم الدمج الذكي' : 'تم الاستبدال الكامل'}</h3>
          <div class="stat-row"><span>أُضيف</span><span class="v">${res.report.added}</span></div>
          <div class="stat-row"><span>حُدّث</span><span class="v">${res.report.updated}</span></div>
          <div class="stat-row"><span>تعارض (أُبقي المحلي الأحدث)</span><span class="v">${res.report.conflicts}</span></div>
          <div class="stat-row"><span>مطابق (تخطي)</span><span class="v">${res.report.skipped}</span></div>
        </div>`;
      await loadState(state.db); // settings may have changed in replace mode
      mountTheme();
      location.hash = '#/tools-backup?r=' + Date.now(); // refresh counts/history
    } catch (err) {
      alert('فشل الاستيراد: ' + err.message);
    }
  }
}
