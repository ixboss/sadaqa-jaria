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
  DEFAULT: { days: {}, totalTasbih: 0, totalPages: 0, athkarDays: {}, completedKhatmahs: 0, khatmahHistory: [] },

  getAll() {
    try {
      const s = localStorage.getItem(this.KEY);
      if (s) {
        const p = JSON.parse(s);
        if (p && typeof p === 'object') {
          if (!p.days || typeof p.days !== 'object') p.days = {};
          if (!p.athkarDays || typeof p.athkarDays !== 'object') p.athkarDays = {};
          if (!Array.isArray(p.khatmahHistory)) p.khatmahHistory = [];
          if (typeof p.completedKhatmahs !== 'number') p.completedKhatmahs = p.khatmahHistory.length;
          return p;
        }
      }
    } catch (e) {}
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
  recordKhatmah(intention = '') {
    const s = this.getAll();
    s.completedKhatmahs = (s.completedKhatmahs || 0) + 1;
    if (!Array.isArray(s.khatmahHistory)) s.khatmahHistory = [];
    s.khatmahHistory.unshift({
      date: this.today(),
      intention: String(intention || '').trim().slice(0, 100)
    });
    if (s.khatmahHistory.length > 50) s.khatmahHistory.length = 50;
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
      const d = new Date(today); d.setDate(today.getDate() - i);
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
    const khatmahCount = all.completedKhatmahs || 0;
    const history = Array.isArray(all.khatmahHistory) ? all.khatmahHistory : [];

    el.innerHTML = `
      <div class="stats-cards">
        <div class="stat-card"><div class="stat-value">${this.toArabic(streak)}</div><div class="stat-label">أيام متتالية 🔥</div></div>
        <div class="stat-card"><div class="stat-value">${this.toArabic(all.totalPages || 0)}</div><div class="stat-label">صفحات مقروءة</div></div>
        <div class="stat-card"><div class="stat-value">${this.toArabic(all.totalTasbih || 0)}</div><div class="stat-label">تسبيحات</div></div>
        <div class="stat-card"><div class="stat-value">${this.toArabic(athkarDays)}</div><div class="stat-label">أيام أذكار</div></div>
        <div class="stat-card" style="grid-column: span 2;"><div class="stat-value">${this.toArabic(khatmahCount)}</div><div class="stat-label">ختمات قرآنية مكتملة 🕋</div></div>
      </div>
      <div class="stats-chart-card">
        <div class="section-heading" style="margin-top:0">قراءة آخر ٧ أيام</div>
        <div class="stats-bars">
          ${week.map((w, idx) => `
            <div class="stats-bar-col">
              <div class="stats-bar-wrap"><div class="stats-bar" data-target-h="${Math.max(4, (w.pages / maxW) * 100)}" style="height:4%; transition-delay:${idx * 55}ms"><span class="stats-bar-tip">${w.pages ? this.toArabic(w.pages) : ''}</span></div></div>
              <div class="stats-bar-label">${w.label}</div>
            </div>`).join('')}
        </div>
      </div>
      ${history.length ? `
      <div class="stats-chart-card" style="margin-top:14px">
        <div class="section-heading" style="margin-top:0">سجل الختمات المكتملة</div>
        ${history.slice(0, 10).map((item, i) => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 4px; border-bottom:1px solid var(--border); font-size:calc(var(--font-size) * 0.52)">
            <span>🕋 الختمة ${this.toArabic(history.length - i)}${item.intention ? ` — <b style="color:var(--accent)">${escapeHtml(item.intention)}</b>` : ''}</span>
            <span style="color:var(--text-dim); font-family:Tahoma,sans-serif">${escapeHtml(item.date || '')}</span>
          </div>`).join('')}
      </div>` : ''}
      <div class="occasion-note">البيانات محفوظة على جهازك فقط ولا تُرسل لأي خادم.</div>`;

    // تحريك أعمدة الرسم البياني من الصفر عند فتح الشاشة
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.querySelectorAll('.stats-bar[data-target-h]').forEach(bar => {
          bar.style.height = bar.dataset.targetH + '%';
        });
      });
    });
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
      ${verses.map((v) => `
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
  FONT_OPTIONS: [
    { pct: 80, label: '٨٠٪' },
    { pct: 100, label: '١٠٠٪' },
    { pct: 130, label: '١٣٠٪' },
    { pct: 150, label: '١٥٠٪' },
    { pct: 200, label: '٢٠٠٪' }
  ],

  getReciter() { try { return localStorage.getItem('reciter') || 'ar.alafasy'; } catch (e) { return 'ar.alafasy'; } },
  setReciter(id) { try { localStorage.setItem('reciter', id); } catch (e) {} },
  getTasbihTarget() { try { return parseInt(localStorage.getItem('tasbih_target') || '33', 10); } catch (e) { return 33; } },
  setTasbihTarget(v) { try { localStorage.setItem('tasbih_target', String(v)); } catch (e) {} },
  remindersEnabled() { try { return localStorage.getItem('reminders_enabled') === '1'; } catch (e) { return false; } },
  setRemindersEnabled(v) { try { localStorage.setItem('reminders_enabled', v ? '1' : '0'); } catch (e) {} },
  getAutoAdvance() { try { return localStorage.getItem('adhkar_auto_advance') !== '0'; } catch (e) { return true; } },
  setAutoAdvance(v) { try { localStorage.setItem('adhkar_auto_advance', v ? '1' : '0'); } catch (e) {} },

  getFontScale() {
    try {
      if (window.state && typeof window.state.fontScale === 'number') {
        return Math.round(window.state.fontScale * 100);
      }
      return parseInt(localStorage.getItem('font_scale') || '130', 10);
    } catch (e) { return 130; }
  },
  setFontScale(v) {
    const clamped = Math.max(80, Math.min(200, v));
    try { localStorage.setItem('font_scale', String(clamped)); } catch (e) {}
  },
  applyFontScale(scale) {
    if (window.applyFontSize) {
      const applied = window.applyFontSize(scale / 100);
      this.setFontScale(Math.round(applied * 100));
    }
  },

  render() {
    const el = document.getElementById('settings-container');
    if (!el) return;
    const curReciter = this.getReciter();
    const curTarget = this.getTasbihTarget();
    const remOn = this.remindersEnabled();
    const fontScale = this.getFontScale();

    el.innerHTML = `
      <div class="settings-card settings-row" data-action="openStats" role="button" tabindex="0" aria-label="الإحصائيات">
        <div><div class="settings-label" style="margin-bottom:2px">📊 الإحصائيات وسجل الختمات</div>
        <div class="surah-meta">السلسلة اليومية، الصفحات المقروءة، التسبيحات، والختمات المكتملة</div></div>
        <div class="settings-arrow">←</div>
      </div>

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
        <div class="settings-targets" style="margin-bottom:10px">
          ${this.FONT_OPTIONS.map(f => `
            <button class="settings-chip ${fontScale === f.pct ? 'active' : ''}" data-font-pct="${f.pct}">${f.label}</button>`).join('')}
        </div>
        <input type="range" id="settings-font-scale" class="settings-slider" min="80" max="200" step="10" value="${fontScale}" aria-label="مقياس حجم الخط">
        <div class="surah-meta">مقياس الخط الموحّد (٨٠٪–٢٠٠٪)</div>
      </div>

      <div class="settings-card settings-row">
        <div>
          <div class="settings-label" style="margin-bottom:2px">تذكيرات يومية</div>
          <div class="surah-meta">تذكير بأذكار الصباح/المساء وورد الختمة أثناء فتح التطبيق.</div>
        </div>
        <button id="settings-reminders" class="settings-toggle ${remOn ? 'on' : ''}" role="switch" aria-checked="${remOn}" aria-label="تذكيرات يومية"><span class="settings-toggle-knob"></span></button>
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

    const tgl = el.querySelector('#settings-reminders');
    if (tgl) tgl.addEventListener('click', () => this.toggleReminders());

    const fileInput = el.querySelector('#backup-file');
    if (fileInput) {
      fileInput.addEventListener('change', e => {
        const file = e.target.files && e.target.files[0];
        if (file && window.BackupManager) window.BackupManager.importFromFile(file);
      });
    }

    if (window.QuranOffline) { QuranOffline.bind(); QuranOffline.render(); }
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
      const fontChip = e.target.closest('[data-font-pct]');
      if (fontChip) {
        const val = parseInt(fontChip.dataset.fontPct, 10);
        Haptics.tap();
        this.applyFontScale(val);
        this.render();
        return;
      }
      const row = e.target.closest('[data-action="openStats"]');
      if (row) { window.Settings.openStats(); return; }
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

    el.addEventListener('change', e => {
      if (e.target.id === 'settings-reciter') {
        this.setReciter(e.target.value);
        if (window.AudioPlayer) AudioPlayer.refreshReciter();
      }
      if (e.target.id === 'settings-font-scale') {
        const val = parseInt(e.target.value, 10);
        this.applyFontScale(val);
        this.render();
      }
    });
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
const QuranOffline = {
  _bound: false,
  _lastState: null,
  _busy: false,

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

  bind() {
    if (this._bound) { this.render(); return; }
    this._bound = true;
    const M = window.MushafPageManager;
    if (M && M.on) {
      M.on((type) => {
        if (type !== 'status' && type !== 'data') return;
        const st = M.getStatus ? M.getStatus() : { state: 'none' };
        if (type === 'status' && st.state === 'downloading' && document.getElementById('quran-dl-bar')) {
          if (this._lastState === 'downloading') { this._progress(st.bytes, st.total); return; }
        }
        this.render();
      });
    }
  }
};
window.QuranOffline = QuranOffline;

/* ==================== 7) Audio player — التلاوة الصوتية + التكرار والسرعة ==================== */
const AudioPlayer = {
  audio: null, queue: [], qi: -1, current: null, surahName: '',
  rafId: null, curEl: null, curWords: null, curItem: null, _lastNow: -2, _errCount: 0,
  mode: 'surah',
  queueStartPage: 0,
  queueEndPage: 0,
  _autoTurning: false,
  _wantScroll: false,
  _listeners: [],
  // ميزة تكرار الآية للتحفيظ + سرعة التلاوة
  repeatTarget: 1,       // 1 = بدون تكرار، 3 = 3 مرات، 5 = 5 مرات، 0 = تكرار غير محدود (∞)
  _repeatDone: 0,
  playbackRate: 1,       // 0.75 | 1 | 1.25

  on(fn) { if (typeof fn === 'function' && !this._listeners.includes(fn)) this._listeners.push(fn); },
  off(fn) { this._listeners = this._listeners.filter(f => f !== fn); },
  emit() { for (const f of this._listeners) { try { f(); } catch (e) {} } },

  ensure() {
    if (this.audio) return;
    this.audio = new Audio();
    this.audio.addEventListener('ended', () => this.advance(false));
    this.audio.addEventListener('error', () => this.advance(true));
    this.audio.addEventListener('pause', () => this.stopClock());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.audio && !this.audio.paused) this.startClock();
    });
  },
  reciter() { return window.Settings ? Settings.getReciter() : 'ar.alafasy'; },
  urlForAyah(globalNo) { return `https://cdn.islamic.network/quran/audio/128/${this.reciter()}/${globalNo}.mp3`; },
  urlFor(surah) { return `https://cdn.islamic.network/quran/audio-surah/128/${this.reciter()}/${surah}.mp3`; },

  cycleRepeat() {
    const order = [1, 3, 5, 0];
    const nextIdx = (order.indexOf(this.repeatTarget) + 1) % order.length;
    this.repeatTarget = order[nextIdx];
    this._repeatDone = 0;
    const labels = { 1: 'بدون تكرار (١×)', 3: 'تكرار الآية ٣ مرات', 5: 'تكرار الآية ٥ مرات', 0: 'تكرار الآية بلا حدود (∞)' };
    if (window.Toast) Toast.show(labels[this.repeatTarget]);
    this.emit();
  },

  cycleSpeed() {
    const rates = [1, 1.25, 0.75];
    const nextIdx = (rates.indexOf(this.playbackRate) + 1) % rates.length;
    this.playbackRate = rates[nextIdx];
    if (this.audio) {
      try { this.audio.playbackRate = this.playbackRate; } catch (e) {}
    }
    if (window.Toast) Toast.show(`سرعة التلاوة: ${this.playbackRate}×`);
    this.emit();
  },

  itemFor(a, page) {
    const sn = (a.surah && a.surah.number) || 0;
    let text = a.text;
    if (a.numberInSurah === 1 && sn !== 1 && sn !== 9) text = window.stripBismillah ? stripBismillah(text) : text;
    const sName = (a.surah && (a.surah.name || a.surah.englishName)) ||
      ((window.allSurahs || []).find(s => s.number === sn) || {}).name || '';
    return { surah: sn, surahName: sName, ayah: a.numberInSurah, global: a.number, text, page: page || 0 };
  },

  buildQueue(surah, fromAyah = 1, ayahs) {
    const data = !Array.isArray(ayahs) && window.state && window.state.currentSurahData ? window.state.currentSurahData : null;
    const list = Array.isArray(ayahs) && ayahs.length ? ayahs
      : (data && Array.isArray(data.ayahs) ? data.ayahs : []);
    this.queue = list.filter(a => a.numberInSurah >= fromAyah).map(a => this.itemFor(a));
    this.qi = this.queue.length ? 0 : -1;
  },

  async extendQueue() {
    const M = window.MushafPageManager;
    if (!M) return;
    const next = this.queueEndPage ? this.queueEndPage + 1 : this.queueStartPage;
    if (next > 604 || next < 1) return;
    try { await M.ensurePage(next); } catch (e) { return; }
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

  repointForPage(n) {
    if (this.mode !== 'pages' || this.qi < 0 || this._autoTurning) return;
    const cur = this.queue[this.qi];
    if (cur && cur.page === n) return;
    const idx = this.queue.findIndex(it => it.page === n);
    if (idx >= 0) { this.qi = idx; this.clearHighlight(); this.loadCurrent(); return; }
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
    this._repeatDone = 0;
    if (this.mode === 'pages' && item.page && window.gotoMushafPage &&
        (window.state ? window.state.mushafPage : 0) !== item.page) {
      this._autoTurning = true;
      this._wantScroll = true;
      window.gotoMushafPage(item.page).catch(() => {}).then(() => { this._autoTurning = false; });
    }
    this.audio.src = this.urlForAyah(item.global);
    try { this.audio.playbackRate = this.playbackRate || 1; } catch (e) {}
    this.audio.play().then(() => {
      this._errCount = 0;
      this.show(this.titleFor(item));
      this.setPlaying(true);
      this.bindHighlight(true);
      this.startClock();
      this.emit();
    }).catch(() => { this.hide(); this.clearHighlight(); this.emit(); });
  },

  estimateDuration(wordCount) {
    const wps = (this.learnedRate() || 0.95) * (this.playbackRate || 1);
    return Math.max(2, wordCount / wps);
  },

  learnedRate() {
    try { return parseFloat(localStorage.getItem('reciter_wps_' + this.reciter()) || '0') || 0; }
    catch (e) { return 0; }
  },

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

  advance(fromError) {
    if (!fromError && this.curWords && this.curWords.length) {
      this.measureRate(this.curWords.length, this.audio.duration);
    }
    // فحص تكرار الآية الحالية (في حال تفعيل وضع التحفيظ/التكرار)
    if (!fromError && this.audio && (this.repeatTarget === 0 || (this.repeatTarget > 1 && this._repeatDone + 1 < this.repeatTarget))) {
      this._repeatDone++;
      this._lastNow = -2;
      this.audio.currentTime = 0;
      try { this.audio.playbackRate = this.playbackRate || 1; } catch (e) {}
      this.audio.play().then(() => { this.startClock(); this.emit(); }).catch(() => {});
      return;
    }
    this._repeatDone = 0;
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
      const before = this.queue.length;
      this.extendQueue().then(() => {
        if (this.queue.length > before) { this.qi++; this.loadCurrent(); }
        else { this.stop(); if (window.Toast) Toast.show('تمت التلاوة ✓'); }
      });
    }
    else { this.stop(); if (window.Toast) Toast.show('تمت التلاوة ✓'); }
  },

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

  refreshHighlight() {
    if (!this.curItem) return;
    if (this.curEl && !this.curEl.isConnected) { this.curEl = null; this.curWords = null; }
    if (!this.curEl) { this.bindHighlight(this._wantScroll); this._wantScroll = false; }
  },

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
    const nativeDur = a && a.duration && isFinite(a.duration) ? a.duration : 0;
    const t = a && a.currentTime >= 0 ? a.currentTime : 0;
    const dur = nativeDur || this.estimateDuration(words.length);
    const frac = dur > 0 ? Math.min(1, Math.max(0, t / dur)) : 0;
    let total = 0; const ends = [];
    for (let i = 0; i < words.length; i++) {
      const len = Math.max(1, (words[i].textContent || '').trim().length);
      total += len; ends.push(total);
    }
    const target = frac * total;
    let nowIdx = -1;
    for (let i = 0; i < ends.length; i++) { if (target <= ends[i]) { nowIdx = i; break; } }
    if (frac >= 1) nowIdx = words.length - 1;
    if (this._lastNow === nowIdx) return;
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
      const nav = document.getElementById('nav');
      if (nav) bar.classList.toggle('nav-lowered', nav.classList.contains('nav-hidden'));
      bar.querySelector('#audio-play-btn').addEventListener('click', () => {
        if (this.audio && this.audio.paused) this.resume(); else this.pause();
      });
      bar.querySelector('#audio-close').addEventListener('click', () => this.stop());
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
    this._repeatDone = 0;
    this.mode = 'surah'; this.queueStartPage = 0; this.queueEndPage = 0;
    this.clearHighlight();
    this.hide();
    this.emit();
  },
  refreshReciter() {
    if (!this.audio || this.qi < 0 || !this.queue[this.qi]) return;
    const wasPlaying = !this.audio.paused;
    this.audio.src = this.urlForAyah(this.queue[this.qi].global);
    try { this.audio.playbackRate = this.playbackRate || 1; } catch (e) {}
    if (wasPlaying) this.audio.play().catch(() => {});
    this.emit();
  },
  bindSurahHeader() {
    const card = document.querySelector('#screen-mushaf .mushaf-topbar .surah-header-card');
    if (!card || card.querySelector('.audio-play')) return;
    const btn = document.createElement('button');
    btn.className = 'audio-play';
    btn.setAttribute('aria-label', 'استمع للسورة');
    btn.innerHTML = '▶';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const st = window.state || {};
      const n = st.currentSurah ? st.currentSurah.number : null;
      const nm = st.currentSurah ? st.currentSurah.name : '';
      if (!n) return;
      if (st.mushafPage && window.MushafPageManager) {
        const M = window.MushafPageManager;
        const pageAyahs = M.pageAyahs(st.mushafPage) || [];
        let fromGlobal = null;
        if (window.selectedAyahNo) {
          const hit = pageAyahs.find(a => a.numberInSurah === window.selectedAyahNo);
          if (hit) fromGlobal = hit.number;
        }
        if (!fromGlobal && !pageAyahs.some(a => (a.surah && a.surah.number) === n)) {
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
const BottomSheet = {
  overlay: null,
  open({ title = '', items = [], current = null, sections = null, customHTML = null, onSelect = null } = {}) {
    this.close();
    const ov = document.createElement('div');
    ov.className = 'sheet-overlay';
    const sh = document.createElement('div');
    sh.className = 'bottom-sheet';
    sh.setAttribute('role', 'dialog');
    sh.setAttribute('aria-modal', 'true');
    sh.setAttribute('aria-label', title);

    if (customHTML !== null) {
      sh.innerHTML = `<div class="sheet-title"></div><div class="sheet-custom-body"></div>`;
      sh.querySelector('.sheet-title').textContent = title;
      sh.querySelector('.sheet-custom-body').innerHTML = customHTML;
    } else {
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
      sh.innerHTML = '<div class="sheet-title"></div>' + bodyHTML;
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
    }

    ov.appendChild(sh);
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('visible'));
    ov.addEventListener('click', ev => { if (ev.target === ov) this.close(); });
    this.overlay = ov;
    document.body.classList.add('sheet-open');
    return sh;
  },
  close() {
    if (this.overlay) { this.overlay.remove(); this.overlay = null; }
    document.body.classList.remove('sheet-open');
  }
};
window.BottomSheet = BottomSheet;

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
const ReaderAudioPill = {
  el: null, bound: false,
  ensure() {
    if (this.bound) { this.el = document.getElementById('mushaf-audio-pill'); return; }
    this.el = document.getElementById('mushaf-audio-pill');
    if (!this.el) return;
    this.el.querySelector('#map-play')?.addEventListener('click', () => {
      const A = window.AudioPlayer; if (!A || !A.audio) return;
      if (A.audio.paused) A.resume(); else A.pause();
    });
    this.el.querySelector('#map-repeat')?.addEventListener('click', () => {
      if (window.AudioPlayer) AudioPlayer.cycleRepeat();
    });
    this.el.querySelector('#map-speed')?.addEventListener('click', () => {
      if (window.AudioPlayer) AudioPlayer.cycleSpeed();
    });
    this.el.querySelector('#map-reciter')?.addEventListener('click', () => {
      if (window.openReciterSheet) openReciterSheet();
    });
    this.el.querySelector('#map-close')?.addEventListener('click', () => {
      if (window.AudioPlayer) AudioPlayer.stop();
    });
    this.bound = true;
  },
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
    if (ay) {
      const repTxt = A.repeatTarget === 0 ? ' (تكرار ∞)' : (A.repeatTarget > 1 ? ` (${A._repeatDone + 1}/${A.repeatTarget})` : '');
      ay.textContent = 'آية ' + (window.toArabicNum ? toArabicNum(item.ayah) : item.ayah) + repTxt;
    }
    const rec = this.el.querySelector('#map-reciter');
    if (rec) {
      const r = (window.Settings ? Settings.RECITERS.find(x => x.id === Settings.getReciter()) : null);
      rec.textContent = r ? r.name.split(' ')[0] : 'القارئ';
    }
    const repBtn = this.el.querySelector('#map-repeat');
    if (repBtn) {
      repBtn.textContent = A.repeatTarget === 0 ? '🔁∞' : `🔁${A.repeatTarget}×`;
      repBtn.classList.toggle('active', A.repeatTarget !== 1);
    }
    const spdBtn = this.el.querySelector('#map-speed');
    if (spdBtn) {
      spdBtn.textContent = `${A.playbackRate || 1}×`;
      spdBtn.classList.toggle('active', (A.playbackRate || 1) !== 1);
    }
    const ic = this.el.querySelector('#map-play');
    if (ic) ic.textContent = (A.audio && !A.audio.paused) ? '⏸' : '▶';
  }
};
window.ReaderAudioPill = ReaderAudioPill;
AudioPlayer.on(() => { if (window.ReaderAudioPill) ReaderAudioPill.render(); });

/* ==================== 7d) ReaderSettings — إعدادات القارئ ==================== */
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
    if (key === 'reader_layout' && this.isInReader() && typeof window.renderMushafPage === 'function') {
      window.renderMushafPage(window.state ? window.state.mushafPage : 1).catch(() => {});
    }
    if (window.Toast) Toast.show('تم الحفظ ✓');
  },

  isInReader() {
    return !!(window.state &&
      (window.state.currentScreen === 'surah-view' || window.state.currentScreen === 'khatmah-read'));
  },

  effectivePageTheme() {
    const t = this.get('reader_theme');
    if (t !== 'auto') return t;
    return (document.body && document.body.classList.contains('theme-light')) ? 'heritage' : 'night';
  },

  applyAll() {
    const b = document.body;
    const pageTheme = this.effectivePageTheme();
    const isVertical = this.get('reader_scroll_dir') === 'vertical';
    b.classList.toggle('mushaf-theme-floral', pageTheme === 'floral');
    b.classList.toggle('mushaf-theme-night', pageTheme === 'night');
    b.classList.toggle('mushaf-design-book',   this.get('reader_page_design') === 'book');
    b.classList.toggle('mushaf-layout-double', this.get('reader_layout') === 'double');
    b.classList.toggle('mushaf-highlight-on',  this.get('reader_highlight') === '1');
    b.classList.toggle('mushaf-scroll-vertical', isVertical);

    if (typeof window.mushafPageStep === 'function' && window.mushafPageStep() !== 2) {
      const col = document.getElementById('mushaf-page-next');
      if (col) col.innerHTML = '';
    }
    if (window.PageFlipEngine) PageFlipEngine.setEnabled(!isVertical);
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

/* ==================== 7e) TafsirManager — التفسير الميسّر للآيات ==================== */
const TafsirManager = {
  CACHE_PREFIX: 'tf_m_',

  async fetchTafsir(globalNo) {
    if (!globalNo) return null;
    const key = this.CACHE_PREFIX + globalNo;
    try {
      const cached = localStorage.getItem(key);
      if (cached) return cached;
    } catch (e) {}

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(`https://api.alquran.cloud/v1/ayah/${globalNo}/ar.muyassar`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const text = json && json.data && json.data.text ? String(json.data.text).trim() : null;
      if (text) {
        try { localStorage.setItem(key, text); } catch (e) {}
      }
      return text;
    } catch (e) {
      clearTimeout(timer);
      return null;
    }
  },

  async openForAyah(ayahData) {
    if (!ayahData || !window.BottomSheet) return;
    const surahMeta = (window.SURAH_META || []).find(s => s.number === ayahData.surah);
    const surahName = surahMeta ? surahMeta.name : ((window.state && window.state.currentSurah && window.state.currentSurah.name) || `سورة ${ayahData.surah}`);
    const arNum = window.toArabicNum ? window.toArabicNum(ayahData.ayah) : ayahData.ayah;
    const title = `التفسير الميسّر — ${surahName} (${arNum})`;

    const sh = BottomSheet.open({
      title,
      customHTML: `
        <div class="tafsir-sheet-ayah">﴿ ${escapeHtml(ayahData.text)} ﴾</div>
        <div class="tafsir-sheet-body" id="tafsir-sheet-body"><div class="skeleton sk-text"></div><div class="skeleton sk-text short"></div></div>
        <div class="tafsir-sheet-actions">
          <button type="button" class="settings-chip" id="tafsir-copy-btn">⧉ نسخ الآية والتفسير</button>
          <button type="button" class="settings-chip" id="tafsir-card-btn">🖼 مشاركة كبطاقة</button>
        </div>`
    });

    const tafsirText = await this.fetchTafsir(ayahData.global);
    const bodyEl = sh.querySelector('#tafsir-sheet-body');
    if (!bodyEl) return;

    if (tafsirText) {
      bodyEl.textContent = tafsirText;
    } else {
      bodyEl.textContent = 'تعذّر تحميل التفسير حالياً. تأكد من اتصالك بالإنترنت عند أول قراءة لتخزينه تلقائياً.';
    }

    sh.querySelector('#tafsir-copy-btn')?.addEventListener('click', async () => {
      const full = `﴿ ${ayahData.text} ﴾\n[${surahName}: ${arNum}]\n\n📖 التفسير الميسّر:\n${tafsirText || ''}`;
      if (window.copyTextToClipboard) {
        const ok = await window.copyTextToClipboard(full);
        if (window.Toast) Toast.show(ok ? 'تم نسخ الآية والتفسير ✓' : 'تعذّر النسخ');
      }
    });

    sh.querySelector('#tafsir-card-btn')?.addEventListener('click', () => {
      BottomSheet.close();
      if (window.ShareCardGenerator) {
        ShareCardGenerator.share({
          badge: `${surahName} — آية ${arNum}`,
          text: `﴿ ${ayahData.text} ﴾`,
          subtext: tafsirText ? `التفسير الميسّر: ${tafsirText}` : ''
        });
      }
    });
  }
};
window.TafsirManager = TafsirManager;

/* ==================== 7f) ShareCardGenerator — مشاركة كبطاقة مصورة (Canvas) ==================== */
const ShareCardGenerator = {
  wrapLines(ctx, text, maxWidth) {
    const paragraphs = String(text || '').split(/\n+/);
    const lines = [];
    for (const para of paragraphs) {
      const words = para.trim().split(/\s+/).filter(Boolean);
      if (!words.length) continue;
      let line = words[0];
      for (let i = 1; i < words.length; i++) {
        const test = line + ' ' + words[i];
        if (ctx.measureText(test).width > maxWidth && line.length > 0) {
          lines.push(line);
          line = words[i];
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  },

  async share({ badge = 'إسلامي', text = '', subtext = '' } = {}) {
    if (!text) return false;
    try {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1200))]);
      }
    } catch (e) {}

    const W = 1080;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';

    // اختيار حجم خط متوازن مع طول النص
    const len = text.length;
    const mainFontSize = len > 420 ? 38 : len > 240 ? 44 : len > 120 ? 52 : 60;
    const lineHeight = Math.round(mainFontSize * 1.9);
    const maxTextWidth = W - 200;

    ctx.font = `700 ${mainFontSize}px "Amiri Quran", "Amiri", serif`;
    const mainLines = this.wrapLines(ctx, text, maxTextWidth).slice(0, 16);

    let subLines = [];
    if (subtext) {
      ctx.font = `400 32px "Amiri", Tahoma, sans-serif`;
      subLines = this.wrapLines(ctx, subtext, maxTextWidth).slice(0, 6);
    }

    const contentH = 260 + mainLines.length * lineHeight + (subLines.length ? 40 + subLines.length * 52 : 0) + 160;
    const H = Math.max(1080, Math.min(1650, contentH));
    canvas.width = W;
    canvas.height = H;

    ctx.direction = 'rtl';
    ctx.textAlign = 'center';

    // خلفية زمردية ليلية فاخرة
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#0a1f28');
    bgGrad.addColorStop(0.5, '#10333f');
    bgGrad.addColorStop(1, '#081920');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // إضاءة دائرية خفيفة في الخلفية
    const radGrad = ctx.createRadialGradient(W * 0.5, H * 0.35, 40, W * 0.5, H * 0.35, W * 0.6);
    radGrad.addColorStop(0, 'rgba(62, 207, 158, 0.12)');
    radGrad.addColorStop(1, 'rgba(62, 207, 158, 0)');
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, W, H);

    // إطار مزدوج ذهبي/زمردي على غرار المصحف
    ctx.strokeStyle = 'rgba(184, 154, 78, 0.65)';
    ctx.lineWidth = 4;
    ctx.strokeRect(42, 42, W - 84, H - 84);

    ctx.strokeStyle = 'rgba(62, 207, 158, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(58, 58, W - 116, H - 116);

    // شارة العنوان العلوية
    ctx.font = '700 36px "Amiri", Tahoma, sans-serif';
    ctx.fillStyle = '#3ecf9e';
    ctx.fillText(badge, W / 2, 145);

    // خط زخرفي تحت الشارة
    ctx.strokeStyle = 'rgba(184, 154, 78, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 140, 175);
    ctx.lineTo(W / 2 + 140, 175);
    ctx.stroke();

    // رسم النص الرئيسي
    ctx.font = `700 ${mainFontSize}px "Amiri Quran", "Amiri", serif`;
    ctx.fillStyle = '#f3f0e7';
    let y = 265;
    for (const line of mainLines) {
      ctx.fillText(line, W / 2, y);
      y += lineHeight;
    }

    // رسم النص الفرعي (المصدر أو التفسير المختصر)
    if (subLines.length) {
      y += 20;
      ctx.font = '400 30px "Amiri", Tahoma, sans-serif';
      ctx.fillStyle = '#9fb8b6';
      for (const sLine of subLines) {
        ctx.fillText(sLine, W / 2, y);
        y += 50;
      }
    }

    // التذييل (صدقة جارية)
    ctx.font = '700 28px "Amiri", Tahoma, sans-serif';
    ctx.fillStyle = 'rgba(184, 154, 78, 0.9)';
    ctx.fillText('تطبيق إسلامي · صدقة جارية 🤍', W / 2, H - 85);

    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          if (window.Toast) Toast.show('تعذّر إنشاء البطاقة');
          resolve(false);
          return;
        }
        const file = new File([blob], 'islami-sadaqa-card.png', { type: 'image/png' });
        try {
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: badge,
              text: `${badge} — تطبيق إسلامي (صدقة جارية)`,
              files: [file]
            });
            resolve(true);
            return;
          }
        } catch (err) {
          if (err && err.name === 'AbortError') { resolve(false); return; }
        }
        // بديل التنزيل المباشر للصورة على الأجهزة التي لا تدعم مشاركة الملفات
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'islami-sadaqa-card.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        if (window.Toast) Toast.show('تم حفظ بطاقة المشاركة كصورة 🖼');
        resolve(true);
      }, 'image/png');
    });
  }
};
window.ShareCardGenerator = ShareCardGenerator;

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
    if (window._internalNav) return;
    const parts = hash.slice(1).replace(/^\/+/, '').split('/');
    const route = parts[0];
    if (route === 'surah' && parts[1] && window.openSurah) {
      const ayahNo = parts[2] ? parseInt(parts[2], 10) : null;
      window.openSurah(parseInt(parts[1], 10), ayahNo);
    }
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
      'surah-view': (window.state && window.state.currentSurah)
        ? '#/surah/' + window.state.currentSurah.number + (window.selectedAyahNo ? '/' + window.selectedAyahNo : '')
        : '#/quran',
      'khatmah-main': '#/khatmah',
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
document.addEventListener('DOMContentLoaded', () => {
  Reminders.init();
  ReaderSettings.applyAll();
  const initDeepLinks = () => {
    if (typeof window.showScreen === 'function') {
      DeepLinks.init();
    } else {
      requestAnimationFrame(initDeepLinks);
    }
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(initDeepLinks);
  } else {
    initDeepLinks();
  }
});
