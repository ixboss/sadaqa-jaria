// ==================== Features Module ====================
// يحتاج: Motion, BookmarkManager, StorageManager (معرّفة في index.html / app.js)
'use strict';

/* ==================== 1) Haptics — الاهتزاز اللمسي ==================== */
const Haptics = {
  supported() { return 'vibrate' in navigator; },
  tap(ms = 12) { if (this.supported()) navigator.vibrate(ms); },
  success() { if (this.supported()) navigator.vibrate([18, 40, 22]); },
  celebrate() { if (this.supported()) navigator.vibrate([25, 50, 25, 50, 45]); }
};
window.Haptics = Haptics;

/* ==================== 2) Unified celebration helper ==================== */
// توحيد الاحتفالات (Tasbih / Khatmah / Athkar) في مكان واحد
window.Celebrate = function (target, opts = {}) {
  const { confetti = 40, burst = 10, ring = true, haptic = true } = opts;
  try {
    if (ring && target && window.Motion) Motion.surgeRing(target);
    if (burst && target && window.Motion) Motion.burst(target, burst, 'var(--accent)');
    if (confetti && window.Motion) Motion.confetti(confetti);
    if (haptic) Haptics.celebrate();
  } catch (e) { /* تجاهل */ }
};

/* ==================== 3) Stats Manager — الإحصائيات والسلاسل ==================== */
const StatsManager = {
  KEY: 'app_stats_v1',
  DEFAULT: { days: {}, totalTasbih: 0, totalPages: 0, athkarDays: {} },

  getAll() {
    try { const s = localStorage.getItem(this.KEY); if (s) { const p = JSON.parse(s); if (p && p.days) return p; } } catch (e) {}
    return JSON.parse(JSON.stringify(this.DEFAULT));
  },
  save(s) { try { localStorage.setItem(this.KEY, JSON.stringify(s)); } catch (e) {} },
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  recordRead(pages = 1) {
    const s = this.getAll();
    const t = this.today();
    s.days[t] = (s.days[t] || 0) + pages;
    s.totalPages = (s.totalPages || 0) + pages;
    this.save(s);
  },
  recordTasbih(count = 1) {
    const s = this.getAll();
    s.totalTasbih = (s.totalTasbih || 0) + count;
    this.save(s);
  },
  recordAthkarDay() {
    const s = this.getAll();
    s.athkarDays[this.today()] = 1;
    this.save(s);
  },

  // السلسلة المتتالية للأيام التي قُرئ فيها
  getStreak() {
    const days = Object.keys(this.getAll().days || {}).sort();
    if (!days.length) return 0;
    const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let streak = 0;
    let cursor = new Date(); cursor.setHours(0, 0, 0, 0);
    // إن لم يُقرأ اليوم بعد، نبدأ العد من الأمس فلا تنكسر سلسلةٌ ما زالت مستمرة
    if (!days.includes(keyOf(cursor))) cursor.setDate(cursor.getDate() - 1);
    for (;;) {
      const key = keyOf(cursor);
      if (days.includes(key)) { streak++; cursor.setDate(cursor.getDate() - 1); }
      else break;
    }
    return streak;
  },
  getWeekPages() {
    const s = this.getAll().days || {};
    const out = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ label: ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][d.getDay()], pages: s[key] || 0 });
    }
    return out;
  },
  getActiveDaysCount() { return Object.keys(this.getAll().days || {}).length; },

  render() {
    const el = document.getElementById('stats-container');
    if (!el) return;
    const all = this.getAll();
    const streak = this.getStreak();
    const week = this.getWeekPages();
    const maxW = Math.max(1, ...week.map(w => w.pages));
    const athkarDays = Object.keys(all.athkarDays || {}).length;

    el.innerHTML = `
      <div class="stats-cards">
        <div class="stat-card"><div class="stat-value">${streak}</div><div class="stat-label">أيام متتالية 🔥</div></div>
        <div class="stat-card"><div class="stat-value">${this.toArabic(all.totalPages || 0)}</div><div class="stat-label">صفحات مقروءة</div></div>
        <div class="stat-card"><div class="stat-value">${this.toArabic(all.totalTasbih || 0)}</div><div class="stat-label">تسبيحات</div></div>
        <div class="stat-card"><div class="stat-value">${this.toArabic(athkarDays)}</div><div class="stat-label">أيام أذكار</div></div>
      </div>
      <div class="stats-chart-card">
        <div class="section-heading" style="margin-top:0">قراءة آخر ٧ أيام</div>
        <div class="stats-bars">
          ${week.map(w => `
            <div class="stats-bar-col">
              <div class="stats-bar-wrap"><div class="stats-bar" style="height:${Math.max(4, (w.pages / maxW) * 100)}%"><span class="stats-bar-tip">${w.pages ? this.toArabic(w.pages) : ''}</span></div></div>
              <div class="stats-bar-label">${w.label}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="occasion-note">البيانات محفوظة على جهازك فقط ولا تُرسل لأي خادم.</div>`;
  },
  toArabic(n) { return (n || 0).toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]); }
};
window.StatsManager = StatsManager;

/* ==================== 5) Bookmarks view — شاشة المرجعيات ==================== */
// مساعد تهريب نص HTML لمنع حقن المحتوى عبر innerHTML
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
window.escapeHtml = escapeHtml;

const BookmarksView = {
  render() {
    const el = document.getElementById('bookmarks-container');
    if (!el) return;
    let bm = { surahs: {}, verses: [] };
    try { bm = window.BookmarkManager.getAll(); } catch (e) {}
    const surahList = Object.entries(bm.surahs || {}).sort((a, b) => b[1].timestamp - a[1].timestamp);
    const verses = (bm.verses || []).slice().reverse();
    const isEmpty = !surahList.length && !verses.length;

    if (isEmpty) {
      el.innerHTML = `<div class="occasion-empty">لا توجد مرجعيات محفوظة بعد.<br>افتح أي سورة واضغط على علامة 🔖 لحفظها.</div>`;
      return;
    }

    el.innerHTML = `
      ${surahList.length ? `<div class="section-heading">السور المحفوظة (${this.toArabic(surahList.length)})</div>` : ''}
      ${surahList.map(([num, info]) => `
        <div class="surah-row" data-magnetic onclick="window.BookmarksView.openSurah(${num})">
          <div class="surah-num">${this.toArabic(num)}</div>
          <div class="surah-info"><div class="surah-name">${escapeHtml(info.name || 'سورة')}</div>
          <div class="surah-meta">محفوظة ${this.timeAgo(info.timestamp)}</div></div>
          <button class="bm-remove" aria-label="حذف" onclick="event.stopPropagation(); window.BookmarksView.removeSurah(${num})">×</button>
        </div>`).join('')}
      ${verses.length ? `<div class="section-heading" style="margin-top:18px">الآيات المحفوظة (${this.toArabic(verses.length)})</div>` : ''}
      ${verses.map((v, i) => `
        <div class="thikr-card" style="padding:16px 20px; cursor:pointer" onclick="window.BookmarksView.openVerse(${v.surah}, ${v.ayah})">
          <div class="surah-meta" style="margin-bottom:6px">سورة ${this.surahName(v.surah)} — آية ${this.toArabic(v.ayah)}</div>
          <div class="dua-text" style="font-size:calc(var(--font-size) * 0.8)">${escapeHtml((v.text || '').slice(0, 160))}…</div>
          <button class="bm-remove" aria-label="حذف" onclick="event.stopPropagation(); window.BookmarksView.removeVerse(${v.surah}, ${v.ayah})">×</button>
        </div>`).join('')}`;
  },
  surahName(n) {
    const meta = (window.SURAH_META || []).find(m => m.number === n);
    return meta ? meta.name : `سورة ${n}`;
  },
  timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const days = Math.floor(diff / 86400000);
    if (days < 1) return 'اليوم';
    if (days === 1) return 'أمس';
    return `منذ ${this.toArabic(days)} يوم`;
  },
  toArabic(n) { return (n || 0).toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]); },
  openSurah(num) { if (window.openSurah) window.openSurah(num); },
  // افتح السورة على صفحة الآية المحفوظة وحدّدها
  openVerse(s, a) { if (window.openSurah) window.openSurah(s, a); },
  removeSurah(num) {
    const el = document.getElementById('bookmarks-container');
    const play = window.Motion ? window.Motion.flipAnimate(el, '.surah-row') : null;
    try { window.BookmarkManager.removeSurahBookmark(num); } catch (e) {}
    this.render();
    if (play) play();
  },
  removeVerse(s, a) {
    const el = document.getElementById('bookmarks-container');
    const play = window.Motion ? window.Motion.flipAnimate(el, '.thikr-card') : null;
    try { window.BookmarkManager.removeVerseBookmark(s, a); } catch (e) {}
    this.render();
    if (play) play();
  }
};
window.BookmarksView = BookmarksView;

/* ==================== 6) Settings — الإعدادات ==================== */
const Settings = {
  RECITERS: [
    { id: 'ar.alafasy', name: 'مشاري العفاسي' },
    { id: 'ar.abdulbasitmurattal', name: 'عبد الباسط عبد الصمد (مرتل)' },
    { id: 'ar.husary', name: 'محمود الحصري' },
    { id: 'ar.minshawi', name: 'محمد المنشاوي' },
    { id: 'ar.mahermuaiqly', name: 'ماهر المعيقلي' }
  ],
  TASBIH_TARGETS: [
    { v: 33, label: '٣٣ (تسبيح)' },
    { v: 99, label: '٩٩ (الاسم الأعظم)' },
    { v: 100, label: '١٠٠ (استغفار)' },
    { v: 1000, label: '١٠٠٠ (الجوامع)' }
  ],

  getReciter() { try { return localStorage.getItem('reciter') || 'ar.alafasy'; } catch (e) { return 'ar.alafasy'; } },
  setReciter(id) { try { localStorage.setItem('reciter', id); } catch (e) {} },
  getTasbihTarget() { try { return parseInt(localStorage.getItem('tasbih_target') || '33', 10); } catch (e) { return 33; } },
  setTasbihTarget(v) { try { localStorage.setItem('tasbih_target', String(v)); } catch (e) {} },
  remindersEnabled() { try { return localStorage.getItem('reminders_enabled') === '1'; } catch (e) { return false; } },
  setRemindersEnabled(v) { try { localStorage.setItem('reminders_enabled', v ? '1' : '0'); } catch (e) {} },
  getAutoAdvance() { try { return localStorage.getItem('adhkar_auto_advance') !== '0'; } catch (e) { return true; } },
  setAutoAdvance(v) { try { localStorage.setItem('adhkar_auto_advance', v ? '1' : '0'); } catch (e) {} },

  getFontScale() { try { return parseInt(localStorage.getItem('font_scale') || '100', 10); } catch (e) { return 100; } },
  setFontScale(v) { try { localStorage.setItem('font_scale', String(Math.max(80, Math.min(140, v)))); } catch (e) {} },
  applyFontScale(scale) { if (window.applyFontSize) window.applyFontSize(scale / 100); },

  render() {
    const el = document.getElementById('settings-container');
    if (!el) return;
    const curReciter = this.getReciter();
    const curTarget = this.getTasbihTarget();
    const remOn = this.remindersEnabled();
    const fontScale = this.getFontScale();

    el.innerHTML = `
      <div class="settings-card">
        <div class="settings-label">هدف السبحة</div>
        <div class="settings-targets">
          ${this.TASBIH_TARGETS.map(t => `
            <button class="settings-chip ${curTarget === t.v ? 'active' : ''}" data-target="${t.v}">${t.label}</button>`).join('')}
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-label">قارئ التلاوة</div>
        <select id="settings-reciter" class="k-input" style="margin-bottom:0">
          ${this.RECITERS.map(r => `<option value="${r.id}" ${r.id === curReciter ? 'selected' : ''}>${r.name}</option>`).join('')}
        </select>
      </div>

      <div class="settings-card">
        <div class="settings-label">حجم الخط <span id="font-scale-value">${fontScale}%</span></div>
        <input type="range" id="settings-font-scale" class="settings-slider" min="80" max="140" step="5" value="${fontScale}" aria-label="مقياس حجم الخط">
        <div class="surah-meta">مقياس الخط العالمي (٨٠٪–١٤٠٪، الافتراضي ١٠٠٪)</div>
      </div>

      <div class="settings-card settings-row">
        <div>
          <div class="settings-label" style="margin-bottom:2px">تذكيرات يومية</div>
          <div class="surah-meta">تذكير بأذكار الصباح/المساء وورد الختمة. تعمل التذكيرات أثناء فتح التطبيق فقط (المتصفح لا يسمح بتذكيرات في الخلفية بدون تثبيت التطبيق).</div>
        </div>
        <button id="settings-reminders" class="settings-toggle ${remOn ? 'on' : ''}" role="switch" aria-checked="${remOn}" aria-label="تذكيرات يومية"><span class="settings-toggle-knob"></span></button>
      </div>

      <div class="settings-card settings-row" data-action="openStats" role="button" tabindex="0" aria-label="الإحصائيات">
        <div><div class="settings-label" style="margin-bottom:2px">الإحصائيات</div>
        <div class="surah-meta">السلسلة، الصفحات، والتسبيحات</div></div>
        <div class="settings-arrow">←</div>
      </div>

      <div class="settings-card">
        <div class="settings-label" style="margin-bottom:6px">القرآن بدون إنترنت</div>
        <div class="surah-meta" id="quran-offline-desc" style="margin-bottom:10px">تنزيل المصحف الكامل (٦٠٤ صفحات) لقراءة القرآن والختمة بلا اتصال.</div>
        <div class="settings-backup-row">
          <button id="quran-dl" class="settings-chip" data-qoffline="download">تنزيل المصحف</button>
          <button id="quran-dl-cancel" class="settings-chip danger" data-qoffline="cancel" hidden>إلغاء</button>
          <button id="quran-dl-delete" class="settings-chip danger" data-qoffline="delete" hidden>حذف النسخة المحلية</button>
        </div>
        <div id="quran-dl-bar" class="quran-dl-bar" hidden><div id="quran-dl-fill" class="quran-dl-fill"></div></div>
        <div id="quran-dl-note" class="quran-dl-note" hidden></div>
        <div class="surah-meta" style="margin-top:8px; font-size:calc(var(--font-size) * 0.44)">المصدر: نص المصحف العثماني من alquran.cloud — نفس المصدر المستخدم عند القراءة أونلاين. يُخزَّن على جهازك فقط.</div>
      </div>

      <div class="settings-card">
        <div class="settings-label" style="margin-bottom:6px">النسخ الاحتياطي</div>
        <div class="surah-meta" style="margin-bottom:10px">صدقة جارية: بياناتك على جهازك فقط. صدِّرها إلى ملف قبل تغيير الجهاز أو مسح بيانات التطبيق.</div>
        <div class="settings-backup-row">
          <button id="backup-export" class="settings-chip" data-backup="export">تصدير نسخة</button>
          <button id="backup-import" class="settings-chip" data-backup="import">استيراد نسخة</button>
          <button id="backup-clear" class="settings-chip danger" data-backup="clear">مسح البيانات</button>
        </div>
        <input type="file" id="backup-file" accept="application/json,.json" style="display:none">
      </div>

      <div class="occasion-note" style="margin-top:16px">تطبيق «إسلامي» — صدقة جارية. جميع بياناتك تبقى على جهازك.</div>`;
  },

  bind() {
    const el = document.getElementById('settings-container');
    if (!el || el.dataset.bound) return;
    el.dataset.bound = '1';

    el.addEventListener('click', e => {
      const chip = e.target.closest('[data-target]');
      if (chip) {
        this.setTasbihTarget(parseInt(chip.dataset.target, 10));
        Haptics.tap();
        this.render();
        if (window.rebuildTasbih) window.rebuildTasbih();
        return;
      }
      const row = e.target.closest('[data-action="openStats"]');
      if (row) { window.Settings.openStats(); }
      const bk = e.target.closest('[data-backup]');
      if (bk) {
        const act = bk.dataset.backup;
        if (act === 'export') { Haptics.tap(); window.BackupManager.export(); }
        else if (act === 'clear') { Haptics.tap(); window.BackupManager.clearAll(); }
        else if (act === 'import') { const f = document.getElementById('backup-file'); if (f) { f.value = ''; f.click(); } }
        return;
      }
      const qo = e.target.closest('[data-qoffline]');
      if (qo) {
        Haptics.tap();
        const act = qo.dataset.qoffline;
        if (act === 'download') window.QuranOffline.startDownload();
        else if (act === 'cancel') window.QuranOffline.cancelDownload();
        else if (act === 'delete') window.QuranOffline.confirmDelete();
        return;
      }
    });

    const fileInput = el.querySelector('#backup-file');
    if (fileInput) {
      fileInput.addEventListener('change', e => {
        const file = e.target.files && e.target.files[0];
        if (file && window.BackupManager) window.BackupManager.importFromFile(file);
      });
    }

    el.addEventListener('change', e => {
      if (e.target.id === 'settings-reciter') {
        this.setReciter(e.target.value);
        if (window.AudioPlayer) AudioPlayer.refreshReciter();
      }
      if (e.target.id === 'settings-font-scale') {
        const val = parseInt(e.target.value, 10);
        this.setFontScale(val);
        this.applyFontScale(val);
        const valEl = document.getElementById('font-scale-value');
        if (valEl) valEl.textContent = val + '%';
      }
    });

    const tgl = el.querySelector('#settings-reminders');
    if (tgl) tgl.addEventListener('click', () => this.toggleReminders());

    // بطاقة القرآن بدون إنترنت: ربط المستمعات وتحديث الحالة الحالية
    if (window.QuranOffline) { QuranOffline.bind(); QuranOffline.render(); }
  },

  async toggleReminders() {
    const next = !this.remindersEnabled();
    if (next) {
      const ok = await window.Reminders.enable();
      if (!ok) { if (window.showAppDialog) await window.showAppDialog('تعذّر تفعيل الإشعارات. يمكن تفعيلها من إعدادات المتصفح.', false); return; }
    } else {
      window.Reminders.disable();
    }
    this.render();
  },

  openStats() {
    if (window.showStats) window.showStats();
  }
};
window.Settings = Settings;

/* ==================== 6b) QuranOffline — حالة تنزيل المصحف ==================== */
// جسر صغير بين محرّك المصحف (mushaf.js) وبطاقة الإعدادات. لا يخزّن شيئاً
// هو نفسه؛ كل الحالة في MushafPageManager.getStatus() + IndexedDB.
const QuranOffline = {
  _bound: false,
  _lastState: null,
  _busy: false,

  // يُستدعى بعد بناء شاشة الإعدادات وفي كل تغيير للحالة
  render() {
    const M = window.MushafPageManager;
    if (!M || !M.getStatus) return;
    const st = M.getStatus() || { state: 'none' };
    this._lastState = st.state;
    const desc = document.getElementById('quran-offline-desc');
    const dl = document.getElementById('quran-dl');
    const cancel = document.getElementById('quran-dl-cancel');
    const del = document.getElementById('quran-dl-delete');
    const bar = document.getElementById('quran-dl-bar');
    const note = document.getElementById('quran-dl-note');
    if (!dl) return;

    if (st.state === 'downloading') {
      dl.hidden = true; cancel.hidden = false; del.hidden = true; bar.hidden = false; note.hidden = false;
      if (desc) desc.textContent = 'جارٍ تنزيل المصحف… لا تُغلق التطبيق.';
      this._progress(st.bytes, st.total);
    } else if (st.state === 'ready') {
      dl.hidden = true; cancel.hidden = true; del.hidden = false; bar.hidden = true; note.hidden = true;
      const size = st.bytes ? (st.bytes / 1048576).toFixed(1) + ' ميغابايت' : '';
      if (desc) desc.textContent = 'المصحف الكامل مخزّن محلياً (٦٢٣٦ آية في ٦٠٤ صفحات' + (size ? ' — ' + size : '') + '). القراءة والختمة تعملان بلا إنترنت.';
    } else if (st.state === 'error') {
      dl.hidden = false; cancel.hidden = true; del.hidden = true; bar.hidden = true; note.hidden = true;
      if (desc) desc.textContent = 'فشل التنزيل (' + this._shortError(st.error) + '). تأكد من الاتصال وحاول مرة أخرى.';
    } else {
      dl.hidden = false; cancel.hidden = true; del.hidden = true; bar.hidden = true; note.hidden = true;
      const again = st.cancelled ? 'أُلغي التنزيل السابق. ' : '';
      if (desc) desc.textContent = again + 'تنزيل المصحف الكامل (٦٠٤ صفحات) لقراءة القرآن والختمة بلا اتصال.';
    }
  },

  // تحديث سريع للشريط فقط — لا يُعيد بناء الشاشة أثناء التنزيل
  _progress(bytes, total) {
    const fill = document.getElementById('quran-dl-fill');
    const note = document.getElementById('quran-dl-note');
    if (!fill) return;
    const mib = (bytes / 1048576).toFixed(1);
    if (total > 0) {
      fill.style.width = Math.min(100, Math.round(bytes / total * 100)) + '%';
      if (note) note.textContent = mib + ' / ' + (total / 1048576).toFixed(1) + ' ميغابايت — ' + Math.min(100, Math.round(bytes / total * 100)) + '٪';
    } else {
      fill.style.width = (Math.min(100, (bytes % 1572864) / 1572864 * 100)) + '%';
      if (note) note.textContent = 'تم تنزيل ' + mib + ' ميغابايت…';
    }
  },

  _shortError(err) {
    const s = String(err || 'خطأ غير معروف');
    return s.length > 90 ? s.slice(0, 90) + '…' : s;
  },

  async startDownload() {
    const M = window.MushafPageManager;
    if (!M || !M.download || this._busy) return;
    this._busy = true;
    this.render();
    try {
      await M.download({ onProgress: p => this._progress(p.bytes, p.total) });
    } catch (e) {
      const msg = String(e && e.message || e);
      if (!/cancelled/i.test(msg) && window.showAppDialog) {
        await window.showAppDialog('تعذّر تنزيل المصحف: ' + this._shortError(msg), false);
      }
    } finally {
      this._busy = false;
      this.render();
    }
  },

  async confirmDelete() {
    const M = window.MushafPageManager;
    if (!M || !window.showAppDialog) return;
    const ok = await window.showAppDialog(
      'سيُحذف المصحف المحلي للقرآن. ستحتاج إلى الإنترنت للقراءة حتى تنزّله مجدداً.<br><br>المرجعيات والتقدّم والباقي لا تتأثر. متابعة الحذف؟', true);
    if (!ok) return;
    await M.erase();
    this.render();
  },

  cancelDownload() {
    const M = window.MushafPageManager;
    if (M && M.cancelDownload) M.cancelDownload();
  },

  // ربط مستمعي الأحداث مرة واحدة فقط
  bind() {
    if (this._bound) { this.render(); return; }
    this._bound = true;
    const M = window.MushafPageManager;
    if (M && M.on) {
      M.on((type) => {
        if (type !== 'status' && type !== 'data') return;
        const st = M.getStatus ? M.getStatus() : { state: 'none' };
        // أثناء التنزيل: عند أول حدث فقط أعد رسم البطاقة (لإظهار الشريط)،
        // بعده حدّث الشريط وحده كي لا يُعاد بناء الشاشة مع كل قطعة.
        if (type === 'status' && st.state === 'downloading' && document.getElementById('quran-dl-bar')) {
          if (this._lastState === 'downloading') { this._progress(st.bytes, st.total); return; }
        }
        this.render();
      });
    }
  }
};
window.QuranOffline = QuranOffline;

/* ==================== 7) Audio player — التلاوة الصوتية ==================== */
// مشغّل آية بآية: كل ملف هو آية واحدة من cdn.islamic.network (نفس المزوّد
// الموثّق للنص)، فيكون موضع بداية ونهاية كل آية دقيقاً بالبناء. داخل الآية
// يُوزَّع التظليل على الكلمات حسب وزن أحرفها ويُعاد ربطه عند كل آية جديدة
// فلا تتراكم أي انحرافات. لا تتوفر بيانات توقيت موثّقة على مستوى الكلمة
// لأي قارئ من القُرّاء، لذا التظليل داخل الآية تقدير بصري متحرّك فقط.
const AudioPlayer = {
  audio: null, queue: [], qi: -1, current: null, surahName: '',
  rafId: null, curEl: null, curWords: null, curItem: null, _lastNow: -2, _errCount: 0,
  // نمط التلاوة: 'surah' (قائمة سورة واحدة) أو 'pages' (نافذة تمتد عبر صفحات المصحف)
  mode: 'surah',
  queueStartPage: 0,   // أول صفحة في النافذة (وضع pages)
  queueEndPage: 0,     // آخر صفحة جُلبت فعلاً (القائمة تمتد كسلاً)
  _autoTurning: false, // الاختلاف الداخلي: قلب الصفحة الآلي أثناء التلاوة
  _wantScroll: false,  // مرّر الآية للمنتصف بعد أن يُعرضها القلب الآلي
  _listeners: [],

  // اشتراك خارجي (القرص الطافي في القارئ) بأي تغيير في حالة التلاوة
  on(fn) { if (typeof fn === 'function' && !this._listeners.includes(fn)) this._listeners.push(fn); },
  off(fn) { this._listeners = this._listeners.filter(f => f !== fn); },
  emit() { for (const f of this._listeners) { try { f(); } catch (e) {} } },

  ensure() {
    if (this.audio) return;
    this.audio = new Audio();
    this.audio.addEventListener('ended', () => this.advance(false));
    this.audio.addEventListener('error', () => this.advance(true));
    this.audio.addEventListener('pause', () => this.stopClock());
    // استئناف ساعة التظليل عند العودة للصفحة (تتوقف أثناء الإخفاء لتوفير الموارد)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.audio && !this.audio.paused) this.startClock();
    });
  },
  reciter() { return window.Settings ? Settings.getReciter() : 'ar.alafasy'; },
  // ملف آية واحدة: {reciter}/{الرقف العالمي للآية}.mp3
  urlForAyah(globalNo) { return `https://cdn.islamic.network/quran/audio/128/${this.reciter()}/${globalNo}.mp3`; },
  urlFor(surah) { return `https://cdn.islamic.network/quran/audio-surah/128/${this.reciter()}/${surah}.mp3`; },

  // يبني عنصر قائمة تلاوة واحد من سجل آية (مشترك بين النمطين)
  itemFor(a, page) {
    const sn = (a.surah && a.surah.number) || 0;
    let text = a.text;
    if (a.numberInSurah === 1 && sn !== 1 && sn !== 9) text = window.stripBismillah ? stripBismillah(text) : text;
    const sName = (a.surah && (a.surah.name || a.surah.englishName)) ||
      ((window.allSurahs || []).find(s => s.number === sn) || {}).name || '';
    return { surah: sn, surahName: sName, ayah: a.numberInSurah, global: a.number, text, page: page || 0 };
  },

  // يبني قائمة التلاوة من بيانات السورة المخزّنة في state، أو من قائمة آيات
  // صريحة يمرّرها القارئ الموحّد (آيات الصفحة المعروضة) — فيُلغى اعتمادنا على
  // state.currentSurahData الذي لا يُملأ إلا من شاشة السورة.
  buildQueue(surah, fromAyah = 1, ayahs) {
    const data = !Array.isArray(ayahs) && window.state && window.state.currentSurahData ? window.state.currentSurahData : null;
    const list = Array.isArray(ayahs) && ayahs.length ? ayahs
      : (data && Array.isArray(data.ayahs) ? data.ayahs : []);
    this.queue = list.filter(a => a.numberInSurah >= fromAyah).map(a => this.itemFor(a));
    this.qi = this.queue.length ? 0 : -1;
  },

  // ===== النمط الثاني: تلاوة متواصلة عبر الصفحات =====
  // القائمة لا تُبنى دفعة واحدة (٦٠٤ صفحة) بل تمتد كسلاً: كلما اقتربنا من
  // نهاية النافذة جلبنا الصفحة التالية، فتستمر التلاوة عبر حدود الصفحات
  // ويقلب القارئ الصفحة بنفسه. تتوقف فقط عند آخر آية في المصحف.
  async extendQueue() {
    const M = window.MushafPageManager;
    if (!M) return;
    const next = this.queueEndPage ? this.queueEndPage + 1 : this.queueStartPage;
    if (next > 604 || next < 1) return;
    try { await M.ensurePage(next); } catch (e) { return; }   // قد يكون شبكياً
    const ayahs = M.pageAyahs(next) || [];
    if (!ayahs.length) return;
    for (const a of ayahs) this.queue.push(this.itemFor(a, next));
    this.queueEndPage = next;
  },

  async playFromPage(startPage, opts = {}) {
    this.ensure();
    const M = window.MushafPageManager;
    if (!M) return;
    this.mode = 'pages';
    this.queueStartPage = M.clampPage(startPage);
    this.queue = []; this.qi = -1; this.queueEndPage = 0;
    // وسِّع مرة على الأقل (لبناء أول صفحة)، ثم إن طُلب البدء من آية بعينها قد
    // تكون على صفحة لاحقة فوسِّع حتى نبلغها — مع حدّ أعلى يحمي من تضخّم النافذة
    let guard = 0;
    while (this.queueEndPage < 604 && ++guard < 14 &&
           (!this.queue.length || (opts.fromGlobal && !this.queue.some(it => it.global === opts.fromGlobal)))) {
      await this.extendQueue();
    }
    const startIdx = opts.fromGlobal ? this.queue.findIndex(it => it.global === opts.fromGlobal) : 0;
    if (startIdx < 0 || !this.queue.length) { this.hide(); this.emit(); return; }
    this.qi = startIdx;
    const first = this.queue[startIdx];
    this.current = first.surah;
    this.surahName = first.surahName || this.surahName;
    this.loadCurrent();
  },

  // قلب يدوي للصفحة أثناء التلاوة: أعد توجيه القائمة للصفحة الجديدة
  // (القارئ الموحّد يترك المستخدم يتصرّف بحرية، ثم تتبعه التلاوة)
  repointForPage(n) {
    if (this.mode !== 'pages' || this.qi < 0 || this._autoTurning) return;
    const cur = this.queue[this.qi];
    if (cur && cur.page === n) return;
    const idx = this.queue.findIndex(it => it.page === n);
    if (idx >= 0) { this.qi = idx; this.clearHighlight(); this.loadCurrent(); return; }
    // الصفحة خارج النافذة الحالية: أعد البناء منها
    this._restartFromPage(n);
  },
  async _restartFromPage(n) {
    const M = window.MushafPageManager;
    if (!M) { this.stop(); return; }
    this.queueStartPage = M.clampPage(n); this.queueEndPage = 0;
    this.queue = []; this.qi = -1;
    await this.extendQueue();
    if (!this.queue.length) { this.stop(); return; }
    this.qi = 0;
    const f = this.queue[0];
    this.current = f.surah; this.surahName = f.surahName || this.surahName;
    this.loadCurrent();
  },

  // زر الرأس: يبدّل بين التشغيل/الإيقاف المؤقت للسورة الحالية، أو يبدأ من الصفحة المعروضة
  play(surah, name, fromAyah = 1) {
    this.ensure();
    if (this.current === surah && this.audio) {
      if (!this.audio.paused) { this.pause(); return; }
      if (this.audio.currentTime > 0) { this.resume(); return; }
    }
    this.current = surah;
    this.surahName = name || (window.state && window.state.currentSurah ? window.state.currentSurah.name : '');
    this.buildQueue(surah, fromAyah);
    if (this.qi < 0) { this.hide(); return; }
    this.loadCurrent();
  },

  // تشغيل مستقل بدءاً من آية محددة (من شريط إجراءات الآية)
  playFromAyah(surah, ayahNo) {
    this.ensure();
    this.current = surah;
    this.surahName = (window.state && window.state.currentSurah ? window.state.currentSurah.name : '');
    this.buildQueue(surah, ayahNo);
    if (this.qi < 0) { this.hide(); return; }
    this.loadCurrent();
  },

  loadCurrent() {
    const item = this.queue[this.qi];
    if (!item) { this.stop(); return; }
    this.curItem = item;
    // وضع الصفحات: تأكّد أن الصفحة التي تحوي الآية معروضة. القلب الآلي هنا
    // هو ما يجعل التلاوة متواصلة عبر الصفحات دون تدخّل المستخدم.
    if (this.mode === 'pages' && item.page && window.gotoMushafPage &&
        (window.state ? window.state.mushafPage : 0) !== item.page) {
      this._autoTurning = true;
      this._wantScroll = true;
      window.gotoMushafPage(item.page).catch(() => {}).then(() => { this._autoTurning = false; });
    }
    this.audio.src = this.urlForAyah(item.global);
    this.audio.play().then(() => {
      this._errCount = 0;
      this.show(this.titleFor(item));
      this.setPlaying(true);
      this.bindHighlight(true);
      this.startClock();
      this.emit();
    }).catch(() => { this.hide(); this.clearHighlight(); this.emit(); });
  },

  // تقدير احتياطي لمدة الآية حين يعجز المتصفح عن حسابها (ملفات بدون رأس Xing).
  // يُشتق من معدّل التلاوة الفعلي المُقاس لكل قارئ — انظر measureRate() —
  // فهو تقدير مبني على بيانات حقيقية، لا قيمة عشوائية.
  estimateDuration(wordCount) {
    const wps = this.learnedRate() || 0.95; // متوسط التلاوة المرتّلة المُقاس ~0.95 كلمة/ثانية
    return Math.max(2, wordCount / wps);
  },

  // سرعة القارئ الحالية (كلمات/ثانية) مُكتسبة من الآيات التي أفصحت عن مدتها
  learnedRate() {
    try { return parseFloat(localStorage.getItem('reciter_wps_' + this.reciter()) || '0') || 0; }
    catch (e) { return 0; }
  },

  // سُجّل السرعة الفعلية بعد انتهاء آية معروفة المدة لاستخدامها لاحقاً.
  // متوسط متحرّك (٠.٥/٠.٥) يخفّف تشوّه الآيات القصيرة المُثقلة بالسكتات.
  measureRate(wordCount, duration) {
    if (!wordCount || !duration || duration <= 0 || !isFinite(duration)) return;
    const rate = wordCount / duration;
    if (!rate || rate <= 0 || rate > 10) return;
    try {
      const key = 'reciter_wps_' + this.reciter();
      const prev = parseFloat(localStorage.getItem(key) || '0') || 0;
      const blended = prev ? prev * 0.5 + rate * 0.5 : rate;
      localStorage.setItem(key, blended.toFixed(3));
    } catch (e) {}
  },

  titleFor(item) {
    const name = (item && item.surahName) || this.surahName || (window.state && window.state.currentSurah ? window.state.currentSurah.name : '');
    return `${name} — آية ${window.toArabicNum ? toArabicNum(item.ayah) : item.ayah}`;
  },

  // الآية التالية (أو تخطّي عند فشل التحميل — لا تتوقف التلاوة أبداً)
  advance(fromError) {
    // سُجّل سرعة هذا القارئ من الآية المنتهية إن كانت مدتها موثوقة
    if (!fromError && this.curWords && this.curWords.length) {
      this.measureRate(this.curWords.length, this.audio.duration);
    }
    this.clearHighlight();
    if (fromError) {
      this._errCount = (this._errCount || 0) + 1;
      if (this._errCount >= 3) {
        this._errCount = 0; this.stop();
        if (window.Toast) Toast.show('تعذّر تحميل التلاوة');
        return;
      }
    } else this._errCount = 0;
    if (this.qi + 1 < this.queue.length) { this.qi++; this.loadCurrent(); }
    else if (this.mode === 'pages' && this.queueEndPage < 604) {
      // نهاية النافذة لا تعني نهاية التلاوة: امتدّ لصفحة جديدة وواصل
      const before = this.queue.length;
      this.extendQueue().then(() => {
        if (this.queue.length > before) { this.qi++; this.loadCurrent(); }
        else { this.stop(); if (window.Toast) Toast.show('تمت التلاوة ✓'); }
      });
    }
    else { this.stop(); if (window.Toast) Toast.show('تمت التلاوة ✓'); }
  },

  // يربط تظليل الآية الجارية بعنصرها إن وُجد في الصفحة المعروضة
  bindHighlight(scroll) {
    this.curEl = null; this.curWords = null; this._lastNow = -2;
    const item = this.curItem;
    if (!item) return;
    const el = document.querySelector(`.ayah[data-global="${item.global}"]`);
    if (!el) return;
    this.curEl = el;
    this.curWords = Array.from(el.querySelectorAll('.w'));
    el.classList.add('reciting');
    if (scroll) {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.top < 130 || r.bottom > vh - 170) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
      }
    }
  },

  // يُستدعى بعد تبديل صفحة المصحف لإعادة الربط إن أصبحت الآية مرئية
  refreshHighlight() {
    if (!this.curItem) return;
    if (this.curEl && !this.curEl.isConnected) { this.curEl = null; this.curWords = null; }
    if (!this.curEl) { this.bindHighlight(this._wantScroll); this._wantScroll = false; }
  },

  // ساعة التظليل: تتبع موضع التشغيل داخل الآية وتحرّك تظليل الكلمات
  startClock() {
    this.stopClock();
    if (document.hidden) return;
    const tick = () => {
      if (document.hidden) { this.rafId = null; return; }
      this.syncWords();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  },
  stopClock() { if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; } },

  syncWords() {
    if (!this.curItem) return;
    if (!this.curEl || !this.curEl.isConnected) {
      this.bindHighlight(false);
      if (!this.curEl) return;
    }
    const words = this.curWords;
    if (!words || !words.length) return;
    const a = this.audio;
    // بعض ملفات الـ MP3 تُرجع مدة غير منتهية (رأس Xing مفقود) فيعجز المتصفح عن
    // حسابها. في هذه الحالة نقدّر المدة من عدد الكلمات ومعدّل التلاوة المعتاد،
    // ثم نُحاكي التقدّم عبر الزمن الفعلي المنقضي (تقدير صريح، وليس توقيتاً موثوقاً).
    const nativeDur = a && a.duration && isFinite(a.duration) ? a.duration : 0;
    const t = a && a.currentTime >= 0 ? a.currentTime : 0;
    const isEstimate = !nativeDur;
    const dur = nativeDur || this.estimateDuration(words.length);
    const frac = dur > 0 ? Math.min(1, Math.max(0, t / dur)) : 0;
    // وزّع الزمن على الكلمات تناسباً مع عدد أحرفها
    let total = 0; const ends = [];
    for (let i = 0; i < words.length; i++) {
      const len = Math.max(1, (words[i].textContent || '').trim().length);
      total += len; ends.push(total);
    }
    const target = frac * total;
    let nowIdx = -1;
    for (let i = 0; i < ends.length; i++) { if (target <= ends[i]) { nowIdx = i; break; } }
    if (frac >= 1) nowIdx = words.length - 1;
    if (this._lastNow === nowIdx) return; // لا أعد الرسم دون تغيّر
    this._lastNow = nowIdx;
    for (let i = 0; i < words.length; i++) {
      words[i].classList.toggle('reciting', i < nowIdx);
      words[i].classList.toggle('reciting-now', i === nowIdx);
    }
  },

  clearHighlight() {
    this.curEl = null; this.curWords = null; this._lastNow = -2;
    document.querySelectorAll('.ayah.reciting').forEach(a => a.classList.remove('reciting'));
    document.querySelectorAll('.w.reciting, .w.reciting-now').forEach(w => w.classList.remove('reciting', 'reciting-now'));
  },

  pause() { if (this.audio) { this.audio.pause(); this.setPlaying(false); this.emit(); } },
  resume() {
    if (this.audio && this.current) {
      this.audio.play().then(() => { this.setPlaying(true); this.startClock(); this.emit(); }).catch(() => {});
    }
  },
  setPlaying(on) {
    const bar = document.getElementById('audio-bar');
    if (!bar) return;
    bar.classList.toggle('playing', on);
    const ic = bar.querySelector('#audio-play-icon');
    if (ic) ic.textContent = on ? '⏸' : '▶';
  },
  show(name) {
    let bar = document.getElementById('audio-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'audio-bar';
      bar.innerHTML = `<button id="audio-play-btn" aria-label="تشغيل/إيقاف"><span id="audio-play-icon">⏸</span></button>
        <div id="audio-title"></div>
        <button id="audio-close" aria-label="إغلاق">×</button>`;
      document.body.appendChild(bar);
      // اضبط موضع الشريط حسب حالة شريط التنقل السفلية
      const nav = document.getElementById('nav');
      if (nav) bar.classList.toggle('nav-lowered', nav.classList.contains('nav-hidden'));
      bar.querySelector('#audio-play-btn').addEventListener('click', () => {
        if (this.audio && this.audio.paused) this.resume(); else this.pause();
      });
      bar.querySelector('#audio-close').addEventListener('click', () => this.stop());
      // وسِّع مساحة شريط إجراءات الآية إن ظهر كلاهما
      const ab = document.getElementById('ayah-bar');
      if (ab) ab.classList.add('with-audio');
    }
    bar.querySelector('#audio-title').textContent = name || '';
    bar.classList.add('visible', 'playing');
    bar.querySelector('#audio-play-icon').textContent = '⏸';
  },
  hide() {
    const bar = document.getElementById('audio-bar');
    if (bar) bar.classList.remove('visible', 'playing');
    const ab = document.getElementById('ayah-bar');
    if (ab) ab.classList.remove('with-audio');
  },
  stop() {
    this.stopClock();
    if (this.audio) { this.audio.pause(); this.audio.currentTime = 0; }
    this.current = null; this.queue = []; this.qi = -1; this.curItem = null;
    this.mode = 'surah'; this.queueStartPage = 0; this.queueEndPage = 0;
    this.clearHighlight();
    this.hide();
    this.emit();
  },
  // تغيير القارئ أثناء التشغيل: أعد تحميل الآية الحالية بالقارئ الجديد
  refreshReciter() {
    if (!this.audio || this.qi < 0 || !this.queue[this.qi]) return;
    const wasPlaying = !this.audio.paused;
    this.audio.src = this.urlForAyah(this.queue[this.qi].global);
    if (wasPlaying) this.audio.play().catch(() => {});
    this.emit();
  },
  // أضف زر التشغيل لبطاقة رأس السورة
  bindSurahHeader() {
    // استخدم class بدلاً من id مكرر، واقصر على بطاقة رأس السورة في القارئ الموحّد
    const card = document.querySelector('#screen-mushaf .mushaf-topbar .surah-header-card');
    if (!card || card.querySelector('.audio-play')) return;
    const btn = document.createElement('button');
    // بدون bookmark-btn حتى لا يلتقطه مفوّض المرجعيات في app.js
    btn.className = 'audio-play';
    btn.setAttribute('aria-label', 'استمع للسورة');
    btn.innerHTML = '▶';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const st = window.state || {};
      const n = st.currentSurah ? st.currentSurah.number : null;
      const nm = st.currentSurah ? st.currentSurah.name : '';
      if (!n) return;
      // القارئ الموحّد: تلاوة متواصلة تبدأ من الصفحة المعروضة، وإن كانت هناك
      // آية محددة عليها ابدأ منها. تعمل من المسارين معاً (السورة والختمة)
      // لأن القائمة تُبنى من آيات الصفحة نفسها، لا من state.currentSurahData.
      if (st.mushafPage && window.MushafPageManager) {
        const M = window.MushafPageManager;
        const pageAyahs = M.pageAyahs(st.mushafPage) || [];
        let fromGlobal = null;
        if (window.selectedAyahNo) {
          const hit = pageAyahs.find(a => a.numberInSurah === window.selectedAyahNo);
          if (hit) fromGlobal = hit.number;
        }
        if (!fromGlobal && !pageAyahs.some(a => (a.surah && a.surah.number) === n)) {
          // السورة المعروضة غير حاضرة في بيانات الصفحة (نظرة قديمة): ابدأ منها
          this.play(n, nm, 1); return;
        }
        this.playFromPage(st.mushafPage, { fromGlobal });
        return;
      }
      this.play(n, nm, 1);
    });
    card.appendChild(btn);
  }
};
window.AudioPlayer = AudioPlayer;

/* ==================== 7b) BottomSheet — ورقة سفلية بسيطة ==================== */
// مكوّن صغير يعيد استخدام لغة التطبيق البصرية (سطح + حد + ظل)، بلا تبعيات.
// تُستخدم لاختيار القارئ، ولاحقاً لإعدادات القارئ (مرحلة ٦).
const BottomSheet = {
  overlay: null,
  // items: قائمة مسطّحة. sections: [{ label, items, current }] لمجموعات
  // متعدّدة داخل ورقة واحدة — تستخدمها إعدادات القارئ (مرحلة ٦).
  open({ title = '', items = [], current = null, sections = null, onSelect = null } = {}) {
    this.close();
    const groups = sections
      ? sections.map(sec => ({ label: sec.label || '', items: sec.items || [], current: sec.current != null ? sec.current : current }))
      : [{ label: '', items: items, current: current }];
    const flat = [];
    const bodyHTML = groups.map(sec =>
      (sec.label ? '<div class="sheet-group-label"></div>' : '') +
      sec.items.map(it => {
        flat.push(it);
        const on = it.value === sec.current;
        return `<button class="sheet-item ${on ? 'active' : ''}" type="button">
          <span class="sheet-item-label"></span>${on ? '<span class="sheet-tick">✓</span>' : ''}</button>`;
      }).join('')
    ).join('');
    const ov = document.createElement('div');
    ov.className = 'sheet-overlay';
    const sh = document.createElement('div');
    sh.className = 'bottom-sheet';
    sh.setAttribute('role', 'dialog');
    sh.setAttribute('aria-label', title);
    sh.innerHTML = '<div class="sheet-title"></div>' + bodyHTML;
    // املأ النصوص بعيداً عن innerHTML حتى لا تُحقن أي علامة من الأسماء
    sh.querySelector('.sheet-title').textContent = title;
    const labels = sh.querySelectorAll('.sheet-group-label');
    let li = 0;
    groups.forEach(sec => {
      if (sec.label) { if (labels[li]) labels[li].textContent = sec.label; li++; }
    });
    sh.querySelectorAll('.sheet-item').forEach((b, i) => {
      const it = flat[i];
      b.querySelector('.sheet-item-label').textContent = it.label;
      b.addEventListener('click', () => {
        this.close();
        if (onSelect) onSelect(it);
      });
    });
    ov.appendChild(sh);
    document.body.appendChild(ov);
    // ارسم الحالة الابتدائية قبل الانتقال كي يُشاهد الانزلاق
    requestAnimationFrame(() => ov.classList.add('visible'));
    // النقر خارج الورقة يغلقها
    ov.addEventListener('click', ev => { if (ev.target === ov) this.close(); });
    this.overlay = ov;
    document.body.classList.add('sheet-open');
  },
  close() {
    if (this.overlay) { this.overlay.remove(); this.overlay = null; }
    document.body.classList.remove('sheet-open');
  }
};
window.BottomSheet = BottomSheet;

// فتح ورقة اختيار القارئ (يستخدمها قرص التلاوة وشاشة الإعدادات)
window.openReciterSheet = function () {
  if (!window.Settings) return;
  BottomSheet.open({
    title: 'اختر القارئ',
    current: Settings.getReciter(),
    items: Settings.RECITERS.map(r => ({ value: r.id, label: r.name })),
    onSelect: it => {
      Settings.setReciter(it.value);
      if (window.AudioPlayer) AudioPlayer.refreshReciter();
      if (window.Toast) Toast.show('تم اختيار: ' + it.label);
    }
  });
};

/* ==================== 7c) ReaderAudioPill — قرص التلاوة الطافي ==================== */
// يشترك في تغييرات AudioPlayer (لا يستبدله): يعرض اسم السورة والآية الجارية
// وزر التشغيل/الإيقاف واسم القارئ (ينفتح على ورقة الاختيار). يظهر فقط في
// الوضع النشط للقارئ الموحّد، وتُخفى شريط #audio-bar العام مكانه.
const ReaderAudioPill = {
  el: null, bound: false,
  ensure() {
    if (this.bound) { this.el = document.getElementById('mushaf-audio-pill'); return; }
    this.el = document.getElementById('mushaf-audio-pill');
    if (!this.el) return;
    this.el.querySelector('#map-play').addEventListener('click', () => {
      const A = window.AudioPlayer; if (!A || !A.audio) return;
      if (A.audio.paused) A.resume(); else A.pause();
    });
    this.el.querySelector('#map-reciter').addEventListener('click', () => {
      if (window.openReciterSheet) openReciterSheet();
    });
    this.el.querySelector('#map-close').addEventListener('click', () => {
      if (window.AudioPlayer) AudioPlayer.stop();
    });
    this.bound = true;
  },
  // هل القارئ الموحّد هو الشاشة الحالية؟
  isReaderActive() {
    const st = window.state || {};
    return st.currentScreen === 'surah-view' || st.currentScreen === 'khatmah-read';
  },
  render() {
    this.ensure();
    if (!this.el) return;
    const A = window.AudioPlayer;
    const active = !!(A && A.curItem && this.isReaderActive());
    this.el.classList.toggle('visible', active);
    document.body.classList.toggle('reader-audio-on', active);
    if (!active) return;
    const item = A.curItem;
    const name = document.getElementById('map-surah');
    const ay = document.getElementById('map-ayah');
    if (name) name.textContent = item.surahName || (window.state && window.state.currentSurah ? window.state.currentSurah.name : '') || '';
    if (ay) ay.textContent = 'آية ' + (window.toArabicNum ? toArabicNum(item.ayah) : item.ayah);
    const rec = this.el.querySelector('#map-reciter');
    if (rec) {
      const r = (window.Settings ? Settings.RECITERS.find(x => x.id === Settings.getReciter()) : null);
      rec.textContent = r ? r.name.split(' ')[0] : 'القارئ';
    }
    const ic = this.el.querySelector('#map-play');
    if (ic) ic.textContent = (A.audio && !A.audio.paused) ? '⏸' : '▶';
  }
};
window.ReaderAudioPill = ReaderAudioPill;
// اشتراك واحد: أي تغيير في التلاوة يُحدّث القرص
AudioPlayer.on(() => { if (window.ReaderAudioPill) ReaderAudioPill.render(); });

/* ==================== 7d) ReaderSettings — إعدادات القارئ (مرحلة ٦) ==================== */
// تُخزَّن بمفاتيحها الخاصّة في localStorage، مستقلّة عن بقية الإعدادات.
// كل قيمة قابلة للتطبيق الفوري على الواجهة:
//   applyAll()      — بعد التشغيل وبعد كل تغيير (أصناف body + محرّك القلب)
//   applyTopics(el) — بعد كل رسم صفحة (تظليل الآيات الموضوعية)
const ReaderSettings = {
  KEYS: {
    reader_scroll_dir: { label: 'اتجاه التمرير', def: 'flip', items: [
      { value: 'flip',     label: 'قلب الصفحات' },
      { value: 'vertical', label: 'تمرير عمودي' } ] },
    reader_page_design: { label: 'تصميم الصفحة', def: 'full', items: [
      { value: 'full', label: 'هامش عادي' },
      { value: 'book', label: 'هامش كتابي موسّع' } ] },
    reader_layout: { label: 'العرض الأفقي', def: 'single', items: [
      { value: 'single', label: 'صفحة واحدة' },
      { value: 'double', label: 'صفحتان جنباً إلى جنب' } ] },
    reader_theme: { label: 'ثيم الصفحة', def: 'auto', items: [
      { value: 'auto',     label: 'تلقائي (يتبع وضع التطبيق)' },
      { value: 'heritage', label: 'التراثي (ذهبي)' },
      { value: 'floral',   label: 'الزهري (أخضر/وردي)' },
      { value: 'night',    label: 'الليلي (داكن)' } ] },
    reader_highlight: { label: 'التظليل الموضوعي', def: '0', items: [
      { value: '0', label: 'متوقف' },
      { value: '1', label: 'تمييز آيات الرحمة والصبر والجنة والتوبة والتوكّل' } ] }
  },

  // جدول موضوعي ثابت مرفق مع التطبيق (بلا اعتماد على الشبكة). كل مدى
  // [سورة، آية البداية، آية النهاية] داخل سورة واحدة — مختارات شهيرة.
  TOPIC_RANGES: [
    { key: 'mercy',    label: 'الرحمة',   ranges: [[1, 1, 7], [39, 53, 53]] },
    { key: 'patience', label: 'الصبر',    ranges: [[2, 153, 157], [94, 5, 6]] },
    { key: 'paradise', label: 'الجنة',    ranges: [[3, 133, 136]] },
    { key: 'repent',   label: 'التوبة',   ranges: [[39, 53, 55]] },
    { key: 'trust',    label: 'التوكّل',  ranges: [[65, 2, 3]] }
  ],

  get(key) {
    const spec = this.KEYS[key];
    if (!spec) return null;
    try {
      const v = localStorage.getItem(key);
      return (v != null && spec.items.some(i => i.value === v)) ? v : spec.def;
    } catch (e) { return spec.def; }
  },

  set(key, v) {
    const spec = this.KEYS[key];
    if (!spec) return;
    try { localStorage.setItem(key, String(v)); } catch (e) {}
    this.applyAll();
    // تغيير التخطيط يحتاج إعادة رسم الصفحة لملء/إفراغ العمود الثاني
    if (key === 'reader_layout' && this.isInReader() && typeof window.renderMushafPage === 'function') {
      window.renderMushafPage(window.state ? window.state.mushafPage : 1).catch(() => {});
    }
    if (window.Toast) Toast.show('تم الحفظ ✓');
  },

  isInReader() {
    return !!(window.state &&
      (window.state.currentScreen === 'surah-view' || window.state.currentScreen === 'khatmah-read'));
  },

  // الوضع التلقائي يحلّ ثيم الصفحة تبعاً لثيم التطبيق: داكن ← ليلي،
  // فاتح ← تراثي. الثيمات الصريحة تبقى كما اختارها المستخدم.
  effectivePageTheme() {
    const t = this.get('reader_theme');
    if (t !== 'auto') return t;
    return (document.body && document.body.classList.contains('theme-light')) ? 'heritage' : 'night';
  },

  // طبّق كل الإعدادات على الواجهة (بعد التشغيل وبعد كل تغيير)
  applyAll() {
    const b = document.body;
    const pageTheme = this.effectivePageTheme();
    b.classList.toggle('mushaf-theme-floral', pageTheme === 'floral');
    b.classList.toggle('mushaf-theme-night', pageTheme === 'night');
    b.classList.toggle('mushaf-design-book',   this.get('reader_page_design') === 'book');
    b.classList.toggle('mushaf-layout-double', this.get('reader_layout') === 'double');
    b.classList.toggle('mushaf-highlight-on',  this.get('reader_highlight') === '1');
    // أفرغ عمود الصفحة الثانية فوراً إن لم يكن العرض المزدوج فاعلاً — بعض
    // البيئات لا تطلق حدث resize عند الدوران، فلا يبقى محتوى مختبئاً خالياً
    if (typeof window.mushafPageStep === 'function' && window.mushafPageStep() !== 2) {
      const col = document.getElementById('mushaf-page-next');
      if (col) col.innerHTML = '';
    }
    // التمرير العمودي ملاذُ وصولٍ لا محرّك قلب: يُطفئ السحب فقط (النقرة تبقى)
    if (window.PageFlipEngine) PageFlipEngine.setEnabled(this.get('reader_scroll_dir') !== 'vertical');
    // أعد بناء التظليل الموضوعي على الصفحة المعروضة (إضافة أو إزالة)
    const scope = document.getElementById('screen-mushaf');
    if (scope) {
      scope.querySelectorAll('.ayah.topic').forEach(el => {
        el.classList.remove('topic');
        el.classList.remove(...Array.from(el.classList).filter(c => c.startsWith('topic-')));
        el.removeAttribute('title');
      });
      if (this.get('reader_highlight') === '1') this.applyTopics();
    }
  },

  // تظليل آيات الموضوعات — تُمرَّر الحاوية أو تُؤخذ من الصفحة الحالية
  applyTopics(container) {
    if (this.get('reader_highlight') !== '1') return;
    const root = container || document.getElementById('verses-container');
    if (!root) return;
    root.querySelectorAll('.ayah[data-surah][data-ayah]').forEach(el => {
      const s = +el.dataset.surah, a = +el.dataset.ayah;
      if (!s || !a) return;
      const hit = this.TOPIC_RANGES.find(t =>
        t.ranges.some(r => s === r[0] && a >= r[1] && a <= r[2]));
      if (hit) {
        el.classList.add('topic', 'topic-' + hit.key);
        el.setAttribute('title', hit.label);
      }
    });
  },

  // ورقة الإعدادات من ترس شريط القارئ — خمس مجموعات في ورقة واحدة
  open() {
    if (!window.BottomSheet) return;
    const sections = Object.keys(this.KEYS).map(k => ({
      label: this.KEYS[k].label,
      current: this.get(k),
      items: this.KEYS[k].items.map(i => ({ value: i.value, label: i.label, key: k }))
    }));
    BottomSheet.open({
      title: 'إعدادات القارئ',
      sections,
      onSelect: it => { if (it && it.key) this.set(it.key, it.value); }
    });
  }
};
window.ReaderSettings = ReaderSettings;
window.openReaderSettings = function () { if (window.ReaderSettings) ReaderSettings.open(); };

/* ==================== 8) Reminders — التذكيرات المحلية ==================== */
const Reminders = {
  timers: [],
  async enable() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'denied') return false;
    if (Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') return false;
    }
    Settings.setRemindersEnabled(true);
    this.scheduleAll();
    return true;
  },
  disable() {
    Settings.setRemindersEnabled(false);
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
  },
  scheduleAll() {
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
    // أوقات التذكير (بالتوقيت المحلي): 6:30 صباحاً، 17:00 مساءً، 20:30 ورد الختمة
    [[6, 30, 'أذكار الصباح 🌅 — ابدأ يومك بالذكر'], [17, 0, 'حان وقت أذكار المساء 🌙'], [20, 30, 'لم تكمل ورد الختمة اليوم 📖']].forEach(([h, m, body]) => {
      this.scheduleDaily(h, m, body);
    });
  },
  scheduleDaily(hour, minute, body) {
    const now = new Date();
    let fire = new Date(); fire.setHours(hour, minute, 0, 0);
    if (fire <= now) fire.setDate(fire.getDate() + 1);
    const ms = fire - now;
    const t = setTimeout(() => {
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('إسلامي', { body, tag: 'reminder-' + hour, icon: './icons/icon-192.png' });
        }
      } catch (e) {}
      // أعد الجدولة لليوم التالي
      this.scheduleDaily(hour, minute, body);
    }, ms);
    this.timers.push(t);
  },
  init() {
    if (this.remindersEnabled() && 'Notification' in window && Notification.permission === 'granted') {
      this.scheduleAll();
    }
  },
  remindersEnabled() { return Settings.remindersEnabled(); }
};
window.Reminders = Reminders;

/* ==================== 9) Deep links — روابط مباشرة (hash) ==================== */
const DeepLinks = {
  init() {
    window.addEventListener('hashchange', () => this.apply(location.hash));
    // ربط التحديث عند تغيير الشاشة
    const origShow = window.showScreen;
    if (typeof origShow === 'function') {
      window.showScreen = function (id, anim) {
        const r = origShow.apply(this, arguments);
        try { DeepLinks.update(id); } catch (e) {}
        return r;
      };
    }
    this.apply(location.hash);
  },
  apply(hash) {
    if (!hash || hash.length < 2) return;
    // تجاهل أحداث التجزئة الناشئة عن رجوعنا الداخلي (زر الرجوع المادي)
    if (window._internalNav) return;
    // تتغيّر التجزئة فتبدأ بـ "#/" — أزِل الـ "#" وأي شرطة مائلة شاغرة قبل التقسيم
    const parts = hash.slice(1).replace(/^\/+/, '').split('/'); // ["surah", "18"]
    const route = parts[0];
    if (route === 'surah' && parts[1] && window.openSurah) {
      const ayahNo = parts[2] ? parseInt(parts[2], 10) : null;
      window.openSurah(parseInt(parts[1], 10), ayahNo);
    }
    // قارئ موحّد عند صفحة بعينها ١..٦٠٤ (آخر ما قُرئ، أو رابط مباشر)
    else if (route === 'page' && parts[1] && window.openMushafPage) {
      window.openMushafPage(parseInt(parts[1], 10));
    }
    else if (route === 'quran' && window.switchTab) { window.switchTab('quran'); }
    else if (route === 'khatmah' && window.switchTab) { window.switchTab('khatmah'); }
    else if (route === 'athkar' && window.switchTab) { window.switchTab('athkar'); }
    else if (route === 'tasbih' && window.openTasbih) { window.openTasbih(); }
    else if (route === 'bookmarks' && window.openBookmarks) { window.openBookmarks(); }
    else if (route === 'stats' && window.showStats) { window.showStats(); }
    else if (route === 'settings' && window.openSettings) { window.openSettings(); }
  },
  update(screenId) {
    const map = {
      // تشمل الآية المحددة إن وُجدت حتى يُعاد فتح الرابط على نفسها
      'surah-view': (window.state && window.state.currentSurah)
        ? '#/surah/' + window.state.currentSurah.number + (window.selectedAyahNo ? '/' + window.selectedAyahNo : '')
        : '#/quran',
      'khatmah-main': '#/khatmah',
      // للختمة رابطها الخاص: الصفحة الحالية ضمن القارئ الموحّد
      'khatmah-read': (window.state && window.state.khatmah)
        ? '#/page/' + (window.state.mushafPage || window.state.khatmah.currentPage || 1)
        : '#/khatmah',
      'athkar-list': '#/athkar', 'thikr-view': '#/athkar',
      'tasbih': '#/tasbih', 'surah-list': '#/quran',
      'bookmarks': '#/bookmarks', 'stats': '#/stats', 'settings': '#/settings'
    };
    const h = map[screenId];
    if (h && location.hash !== h) history.replaceState(null, '', h);
  }
};
window.DeepLinks = DeepLinks;

/* ==================== 10) Boot ==================== */
// ملاحظة: التذكيرات تعتمد على setTimeout فتعمل فقط أثناء فتح التطبيق؛
// لا يمكن للمتصفح إطلاقها في الخلفية بدون تثبيت PWA + Periodic Sync.
document.addEventListener('DOMContentLoaded', () => {
  Reminders.init();
  // طبّق إعدادات القارئ قبل أول رسم (الثيم والهامش) كي لا يومض
  ReaderSettings.applyAll();
  // انتظر حتى تصبح showScreen متاحة (ترتيب التحميل غير المضمون مع السكربتات المؤجلة)
  const initDeepLinks = () => {
    if (typeof window.showScreen === 'function') {
      DeepLinks.init();
    } else {
      // أعد المحاولة في الإطار التالي حتى تتوفر الدالة
      requestAnimationFrame(initDeepLinks);
    }
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(initDeepLinks);
  } else {
    initDeepLinks();
  }
});
